"""Fixed-price photo editing packages."""

from decimal import Decimal

EDITING_TURNAROUND = 'Within 1 week (email delivery)'

EDITING_PACKAGES = {
    'standard': {
        'label': 'Standard',
        'min_photos': 1,
        'max_photos': 3,
        'price': Decimal('5.00'),
    },
    'plus': {
        'label': 'Plus',
        'min_photos': 4,
        'max_photos': 10,
        'price': Decimal('10.00'),
    },
    'bundle': {
        'label': 'Bundle',
        'min_photos': 11,
        'max_photos': 20,
        'price': Decimal('15.00'),
    },
}

PACKAGE_CHOICES = [(key, meta['label']) for key, meta in EDITING_PACKAGES.items()]


def package_for_count(count: int) -> str | None:
    for key, meta in EDITING_PACKAGES.items():
        if meta['min_photos'] <= count <= meta['max_photos']:
            return key
    return None


def validate_package_count(package: str, count: int) -> str | None:
    """Return an error message if invalid, else None."""
    meta = EDITING_PACKAGES.get(package)
    if meta is None:
        return f'Invalid package. Must be one of: {list(EDITING_PACKAGES)}'
    if count < meta['min_photos'] or count > meta['max_photos']:
        return (
            f'Package "{package}" requires {meta["min_photos"]}–{meta["max_photos"]} '
            f'photos; got {count}.'
        )
    return None
