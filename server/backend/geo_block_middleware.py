"""Block API access from configured countries (default: Mexico)."""

from __future__ import annotations

import ipaddress
import logging
from typing import Callable

import requests
from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse, JsonResponse

logger = logging.getLogger(__name__)

# Paths that must keep working regardless of visitor country (webhooks, assets).
_SKIP_PREFIXES = (
    '/media/',
    '/django-admin/',
    '/api/payments/webhook',
)


def _client_ip(request: HttpRequest) -> str | None:
    """Best-effort client IP behind Railway / proxies."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        # Left-most is the original client when proxies append.
        return forwarded.split(',')[0].strip()
    real_ip = request.META.get('HTTP_X_REAL_IP')
    if real_ip:
        return real_ip.strip()
    remote = request.META.get('REMOTE_ADDR')
    return remote.strip() if remote else None


def _is_skippable_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
    )


def _country_from_cloudflare(request: HttpRequest) -> str | None:
    code = request.META.get('HTTP_CF_IPCOUNTRY', '').strip().upper()
    if code and code not in ('XX', 'T1'):  # XX unknown, T1 tor
        return code
    return None


def _country_from_ip_api(ip: str) -> str | None:
    cache_key = f'geo_country:{ip}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None

    code = ''
    try:
        resp = requests.get(
            f'http://ip-api.com/json/{ip}',
            params={'fields': 'status,countryCode'},
            timeout=2.5,
        )
        if resp.ok:
            data = resp.json()
            if data.get('status') == 'success':
                code = str(data.get('countryCode') or '').upper()
    except Exception:
        logger.debug('Geo lookup failed for %s', ip, exc_info=True)

    # Cache empty string for failures so we don't hammer the API.
    cache.set(cache_key, code, timeout=60 * 60 * 24)
    return code or None


def lookup_country(request: HttpRequest, ip: str) -> str | None:
    return _country_from_cloudflare(request) or _country_from_ip_api(ip)


class GeoBlockMiddleware:
    """
    Reject application API requests from blocked countries.

    Configure with:
      GEO_BLOCK_ENABLED=True
      BLOCKED_COUNTRIES=MX
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if self._should_block(request):
            return JsonResponse(
                {
                    'detail': 'Access from your region is not available.',
                    'code': 'region_blocked',
                },
                status=403,
            )
        return self.get_response(request)

    def _should_block(self, request: HttpRequest) -> bool:
        if not getattr(settings, 'GEO_BLOCK_ENABLED', True):
            return False

        if request.method == 'OPTIONS':
            return False

        path = request.path or ''
        if not path.startswith('/api/'):
            return False
        for prefix in _SKIP_PREFIXES:
            if path.startswith(prefix):
                return False

        blocked = {
            c.strip().upper()
            for c in getattr(settings, 'BLOCKED_COUNTRIES', ['MX'])
            if c and str(c).strip()
        }
        if not blocked:
            return False

        ip = _client_ip(request)
        if not ip or _is_skippable_ip(ip):
            return False

        country = lookup_country(request, ip)
        if not country:
            # Fail open if we cannot determine country (keeps UK users unblocked).
            return False

        return country in blocked
