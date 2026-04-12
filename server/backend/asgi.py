import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.urls import re_path

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

django_asgi_app = get_asgi_application()

# Import consumers after Django setup to avoid AppRegistryNotReady
from content.consumers import ChatConsumer, NotificationConsumer  # noqa: E402

websocket_urlpatterns = [
    re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
    re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
]

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AllowedHostsOriginValidator(
        URLRouter(websocket_urlpatterns)
    ),
})
