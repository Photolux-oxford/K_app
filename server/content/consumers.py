import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from .models import Message, EditingRequest, BookingRequest


async def _authenticate_token(token_str):
    """Validate JWT and return User or None."""
    try:
        token = AccessToken(token_str)
        user_id = token['user_id']
        user = await database_sync_to_async(User.objects.get)(pk=user_id)
        return user
    except (InvalidToken, TokenError, User.DoesNotExist, KeyError):
        return None


@database_sync_to_async
def _user_owns_thread(user, thread_type, thread_id):
    if thread_type == 'editing':
        return EditingRequest.objects.filter(pk=thread_id, customer=user).exists()
    elif thread_type == 'booking':
        return BookingRequest.objects.filter(pk=thread_id, customer=user).exists()
    return False


@database_sync_to_async
def _get_thread_customer_id(thread_type, thread_id):
    """Return the customer user_id for a thread, or None if not found."""
    try:
        if thread_type == 'editing':
            return EditingRequest.objects.get(pk=thread_id).customer_id
        elif thread_type == 'booking':
            return BookingRequest.objects.get(pk=thread_id).customer_id
        return None
    except (EditingRequest.DoesNotExist, BookingRequest.DoesNotExist):
        return None


@database_sync_to_async
def _create_message(thread_type, thread_id, sender, body):
    return Message.objects.create(
        thread_type=thread_type,
        thread_id=thread_id,
        sender=sender,
        body=body,
    )


@database_sync_to_async
def _get_unread_count(user_id, is_staff=False):
    """Total unread messages for a user across all their threads."""
    if is_staff:
        return Message.objects.filter(
            read_by_recipient=False
        ).exclude(sender__is_staff=True).count()
    editing_ids = list(EditingRequest.objects.filter(customer_id=user_id).values_list('id', flat=True))
    booking_ids = list(BookingRequest.objects.filter(customer_id=user_id).values_list('id', flat=True))
    editing_unread = Message.objects.filter(
        thread_type='editing',
        thread_id__in=editing_ids,
        read_by_recipient=False,
    ).exclude(sender_id=user_id).count()
    booking_unread = Message.objects.filter(
        thread_type='booking',
        thread_id__in=booking_ids,
        read_by_recipient=False,
    ).exclude(sender_id=user_id).count()
    return editing_unread + booking_unread


@database_sync_to_async
def _get_staff_unread_count():
    """Unread count for staff: messages from customers not yet read."""
    return Message.objects.filter(
        read_by_recipient=False
    ).exclude(sender__is_staff=True).count()


def _parse_token_from_query(query_string: bytes) -> str | None:
    """Extract token= from a WebSocket query string."""
    decoded = query_string.decode() if isinstance(query_string, bytes) else query_string
    for part in decoded.split('&'):
        if part.startswith('token='):
            return part[6:]
    return None


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.thread_type = self.scope['url_route']['kwargs']['thread_type']
        self.thread_id = int(self.scope['url_route']['kwargs']['thread_id'])
        self.room_group = f"chat_{self.thread_type}_{self.thread_id}"

        token_str = _parse_token_from_query(self.scope.get('query_string', b''))
        if not token_str:
            await self.close(code=4003)
            return

        user = await _authenticate_token(token_str)
        if user is None:
            await self.close(code=4003)
            return

        if not user.is_staff:
            owns = await _user_owns_thread(user, self.thread_type, self.thread_id)
            if not owns:
                await self.close(code=4003)
                return

        self.user = user
        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group'):
            await self.channel_layer.group_discard(self.room_group, self.channel_name)

    async def receive(self, text_data):
        if not hasattr(self, 'user'):
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        body = data.get('body', '').strip()
        if not body:
            return
        if len(body) > 4000:
            return

        msg = await _create_message(self.thread_type, self.thread_id, self.user, body)

        # Broadcast to thread group
        await self.channel_layer.group_send(
            self.room_group,
            {
                'type': 'chat_message',
                'message': {
                    'id': msg.id,
                    'sender_email': self.user.email,
                    'body': msg.body,
                    'timestamp': msg.timestamp.isoformat(),
                    'sender_id': self.user.id,
                },
            }
        )

        # Push updated unread count to recipient's notification channel
        if self.user.is_staff:
            # Recipient is the customer
            recipient_id = await _get_thread_customer_id(self.thread_type, self.thread_id)
            if recipient_id:
                count = await _get_unread_count(recipient_id)
                await self.channel_layer.group_send(
                    f'user_{recipient_id}',
                    {'type': 'unread_count_update', 'count': count}
                )
        else:
            # Recipient is staff
            count = await _get_staff_unread_count()
            await self.channel_layer.group_send(
                'staff_notifications',
                {'type': 'unread_count_update', 'count': count}
            )

    async def chat_message(self, event):
        msg = event['message']
        await self.send(text_data=json.dumps({
            'type': 'message',
            'message': {
                'id': msg['id'],
                'sender_email': msg['sender_email'],
                'body': msg['body'],
                'timestamp': msg['timestamp'],
                'is_own': msg['sender_id'] == self.user.id,
            }
        }))

    async def unread_count_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'unread_count',
            'count': event['count'],
        }))


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        token_str = _parse_token_from_query(self.scope.get('query_string', b''))
        if not token_str:
            await self.close(code=4003)
            return

        user = await _authenticate_token(token_str)
        if user is None:
            await self.close(code=4003)
            return

        self.user = user
        self.personal_group = f'user_{user.id}'

        await self.channel_layer.group_add(self.personal_group, self.channel_name)
        if user.is_staff:
            await self.channel_layer.group_add('staff_notifications', self.channel_name)

        await self.accept()

        # Send current unread count immediately
        count = await _get_unread_count(user.id, is_staff=user.is_staff)
        await self.send(text_data=json.dumps({'type': 'unread_count', 'count': count}))

    async def disconnect(self, close_code):
        if hasattr(self, 'personal_group'):
            await self.channel_layer.group_discard(self.personal_group, self.channel_name)
        if hasattr(self, 'user') and self.user.is_staff:
            await self.channel_layer.group_discard('staff_notifications', self.channel_name)

    async def receive(self, text_data):
        # No client->server messages expected on notification consumer
        pass

    async def unread_count_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'unread_count',
            'count': event['count'],
        }))
