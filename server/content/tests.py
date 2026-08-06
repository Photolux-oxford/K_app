from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient as DRFClient
from .models import (
    Category, PortfolioItem, AvailabilitySlot, BookingRequest,
    EditingRequest, EditingFile, Payment, Message, ServiceArea, HeroSlot
)
import datetime
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async

class ModelSmokeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='customer@example.com',
            email='customer@example.com',
            password='testpass123'
        )

    def test_portfolio_item_creation(self):
        cat, _ = Category.objects.get_or_create(name='Smoke Wedding', defaults={'slug': 'smoke-wedding'})
        item = PortfolioItem.objects.create(
            title='Wedding Shot', category=cat, image='portfolio/test.jpg', published=True
        )
        self.assertEqual(str(item), 'Wedding Shot')
        self.assertTrue(item.published)
        self.assertEqual(item.order, 0)

    def test_availability_slot_creation(self):
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 6, 1),
            block='morning',
            status='available',
        )
        self.assertFalse(slot.is_booked)

    def test_booking_request_creation(self):
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 6, 1),
            block='morning',
            status='available',
        )
        booking = BookingRequest.objects.create(
            customer=self.user,
            session_type='portrait',
            location='12 High Street, Oxford',
            postcode='OX1 3DP',
            is_home_visit=True,
            slot=slot,
        )
        self.assertEqual(booking.status, 'pending')

    def test_editing_request_and_file(self):
        req = EditingRequest.objects.create(
            customer=self.user,
            style_notes='Natural light, warm tones',
            turnaround='5 days',
        )
        self.assertEqual(req.status, 'requested')
        self.assertIsNone(req.quoted_price)
        f = EditingFile.objects.create(editing_request=req, file='editing/photo.jpg')
        self.assertEqual(f.editing_request, req)

    def test_payment_linked_to_booking(self):
        booking = BookingRequest.objects.create(
            customer=self.user,
            session_type='event',
            location='Town Hall',
            postcode='OX1 1AA',
        )
        payment = Payment.objects.create(
            booking=booking,
            stripe_payment_intent_id='pi_test_123',
            amount='150.00',
        )
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(payment.currency, 'GBP')

    def test_message_creation(self):
        booking = BookingRequest.objects.create(
            customer=self.user,
            session_type='portrait',
            location='Home',
            postcode='OX2 1AA',
        )
        msg = Message.objects.create(
            thread_type='booking',
            thread_id=booking.id,
            sender=self.user,
            body='Hi Kay, I was wondering about the session.',
        )
        self.assertFalse(msg.read_by_recipient)

    def test_message_read_by_recipient_default_false(self):
        booking = BookingRequest.objects.create(
            customer=self.user,
            session_type='portrait',
            location='Oxford',
            postcode='OX1 1AA',
        )
        msg = Message.objects.create(
            thread_type='booking',
            thread_id=booking.id,
            sender=self.user,
            body='Hello',
        )
        self.assertFalse(msg.read_by_recipient)
        self.assertFalse(hasattr(msg, 'is_read'))


class AvailabilitySlotModelTests(TestCase):
    def test_block_auto_fills_morning_times(self):
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1),
            block='morning',
            status='available',
        )
        self.assertEqual(slot.start_time, datetime.time(8, 0))
        self.assertEqual(slot.end_time, datetime.time(11, 0))

    def test_block_auto_fills_afternoon_times(self):
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1),
            block='afternoon',
            status='available',
        )
        self.assertEqual(slot.start_time, datetime.time(12, 0))
        self.assertEqual(slot.end_time, datetime.time(15, 0))

    def test_block_auto_fills_evening_times(self):
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1),
            block='evening',
            status='potential',
        )
        self.assertEqual(slot.start_time, datetime.time(16, 0))
        self.assertEqual(slot.end_time, datetime.time(20, 0))

    def test_unique_date_block_constraint(self):
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1),
            block='morning',
            status='available',
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            AvailabilitySlot.objects.create(
                date=datetime.date(2026, 5, 1),
                block='morning',
                status='unavailable',
            )


class ServiceAreaTests(TestCase):
    def test_get_creates_default_empty_service_area(self):
        area = ServiceArea.get()
        self.assertIsNotNone(area)
        self.assertEqual(area.polygon, [])

    def test_service_area_singleton(self):
        a1 = ServiceArea.get()
        a2 = ServiceArea.get()
        self.assertEqual(a1.pk, a2.pk)

    def test_service_area_stores_polygon(self):
        area = ServiceArea.get()
        area.polygon = [
            {"lat": 51.7520, "lng": -1.2577},
            {"lat": 51.7600, "lng": -1.2700},
            {"lat": 51.7450, "lng": -1.2800},
        ]
        area.save()
        reloaded = ServiceArea.objects.get(pk=area.pk)
        self.assertEqual(len(reloaded.polygon), 3)
        self.assertEqual(reloaded.polygon[0]["lat"], 51.7520)


class ServiceAreaAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.staff = User.objects.create_user(
            username='kay@example.com', email='kay@example.com',
            password='kaypass123', is_staff=True
        )
        self.customer = User.objects.create_user(
            username='cust@example.com', email='cust@example.com',
            password='custpass123'
        )

    def test_get_service_area_is_public(self):
        res = self.client.get('/api/service-area/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('polygon', res.data)
        self.assertIn('studio_lat', res.data)
        self.assertIn('studio_address', res.data)

    def test_patch_service_area_requires_staff(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.patch('/api/service-area/', {'polygon': []}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_patch_service_area_as_staff_succeeds(self):
        self.client.force_authenticate(user=self.staff)
        polygon = [
            {"lat": 51.7520, "lng": -1.2577},
            {"lat": 51.7600, "lng": -1.2700},
            {"lat": 51.7450, "lng": -1.2800},
        ]
        res = self.client.patch('/api/service-area/', {'polygon': polygon}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['polygon']), 3)

    def test_patch_studio_location_as_staff(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.patch('/api/service-area/', {
            'studio_name': 'Photolux Oxford Studio',
            'studio_address': '1 High Street, Oxford',
            'studio_lat': 51.752,
            'studio_lng': -1.2577,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['studio_name'], 'Photolux Oxford Studio')
        self.assertEqual(res.data['studio_lat'], 51.752)

    def test_patch_rejects_invalid_polygon_format(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.patch('/api/service-area/', {'polygon': "not a list"}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_check_postcode_outside_empty_zone(self):
        # Empty polygon → no home visits available
        ServiceArea.get()  # ensure it exists with empty polygon
        res = self.client.post('/api/service-area/check/', {'postcode': 'OX1 3DP'}, format='json')
        # postcodes.io is external; accept 200 or 503
        self.assertIn(res.status_code, [200, 503])


class AdminCalendarAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.staff = User.objects.create_user(
            username='kay@test.com', email='kay@test.com',
            password='pass', is_staff=True
        )
        self.customer = User.objects.create_user(
            username='cust@test.com', email='cust@test.com',
            password='pass'
        )

    def test_list_requires_staff(self):
        from content.models import AdminCalendarEvent
        AdminCalendarEvent.objects.create(title='Shoot', date=datetime.date(2026, 5, 1))
        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/admin/calendar/?month=2026-05')
        self.assertEqual(res.status_code, 403)

    def test_create_and_list_event(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post('/api/admin/calendar/', {
            'title': 'Portrait shoot',
            'date': '2026-05-10',
            'start_time': '09:00',
            'end_time': '11:00',
            'notes': 'Client: Alex',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['title'], 'Portrait shoot')
        listed = self.client.get('/api/admin/calendar/?month=2026-05')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)

    def test_update_and_delete_event(self):
        from content.models import AdminCalendarEvent
        self.client.force_authenticate(user=self.staff)
        ev = AdminCalendarEvent.objects.create(
            title='Old', date=datetime.date(2026, 5, 1),
        )
        res = self.client.patch(f'/api/admin/calendar/{ev.id}/', {
            'title': 'Updated',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['title'], 'Updated')
        deleted = self.client.delete(f'/api/admin/calendar/{ev.id}/')
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(AdminCalendarEvent.objects.count(), 0)

    def test_deprecated_availability_returns_410(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get('/api/admin/availability/?month=2026-05')
        self.assertEqual(res.status_code, 410)
        res2 = self.client.get('/api/availability/?month=2026-05')
        self.assertEqual(res2.status_code, 410)


class CustomerAvailabilityAPITests(TestCase):
    def test_public_availability_gone(self):
        res = self.client.get('/api/availability/?month=2026-05')
        self.assertEqual(res.status_code, 410)


class CreateBookingAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='cust@test.com', email='cust@test.com', password='pass'
        )

    def test_requires_authentication(self):
        res = self.client.post('/api/bookings/', {
            'session_type': 'portrait',
            'phone': '07000000000',
        }, format='json')
        self.assertEqual(res.status_code, 401)

    def test_creates_booking_without_slot(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'session_type': 'portrait',
            'phone': '07000000001',
            'notes': 'morning light preferred',
            'preferred_schedule': 'Weekday mornings in May',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIn('id', res.data)
        self.assertEqual(res.data['status'], 'pending')
        booking = BookingRequest.objects.get(pk=res.data['id'])
        self.assertIsNone(booking.slot_id)
        self.assertEqual(booking.preferred_schedule, 'Weekday mornings in May')
        self.assertFalse(booking.is_home_visit)
        self.assertTrue(booking.location)
        self.assertTrue(
            Message.objects.filter(thread_type='booking', thread_id=res.data['id']).exists()
        )

    def test_rejects_invalid_session_type(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'session_type': 'circus',
            'phone': '07000000003',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_rejects_missing_required_fields(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'session_type': 'portrait',
        }, format='json')
        self.assertEqual(res.status_code, 400)


class CreateEditingRequestAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='cust@test.com', email='cust@test.com', password='pass'
        )

    def test_requires_authentication(self):
        res = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones', 'package': 'standard'
        }, format='json')
        self.assertEqual(res.status_code, 401)

    def test_creates_editing_request(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones, natural light',
            'package': 'standard',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIn('id', res.data)
        self.assertEqual(res.data['status'], 'requested')
        self.assertEqual(res.data['package'], 'standard')
        self.assertEqual(res.data['quoted_price'], '5.00')

    def test_rejects_missing_style_notes(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/editing-requests/', {
            'package': 'standard'
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_rejects_missing_package(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones'
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_upload_file_to_editing_request(self):
        self.client.force_authenticate(user=self.customer)
        editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='test notes',
            turnaround='Within 1 week (email delivery)',
            package='standard',
            quoted_price='5.00',
        )
        from django.core.files.uploadedfile import SimpleUploadedFile
        fake_image = SimpleUploadedFile(
            'photo.jpg', b'fake-jpeg-content', content_type='image/jpeg'
        )
        res = self.client.post(
            f'/api/editing-requests/{editing.id}/files/',
            {'file': fake_image},
            format='multipart',
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn('id', res.data)
        self.assertEqual(EditingFile.objects.filter(editing_request=editing).count(), 1)

    def test_upload_rejects_oversized_file(self):
        self.client.force_authenticate(user=self.customer)
        editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='test notes',
            turnaround='Within 1 week (email delivery)',
            package='standard',
            quoted_price='5.00',
        )
        from django.core.files.uploadedfile import SimpleUploadedFile
        big_file = SimpleUploadedFile(
            'big.jpg',
            b'x' * (25 * 1024 * 1024 + 1),
            content_type='image/jpeg'
        )
        res = self.client.post(
            f'/api/editing-requests/{editing.id}/files/',
            {'file': big_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)

    def test_upload_rejects_disallowed_file_type(self):
        self.client.force_authenticate(user=self.customer)
        editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='test notes',
            turnaround='Within 1 week (email delivery)',
            package='standard',
            quoted_price='5.00',
        )
        from django.core.files.uploadedfile import SimpleUploadedFile
        bad_file = SimpleUploadedFile(
            'virus.exe', b'bad content', content_type='application/octet-stream'
        )
        res = self.client.post(
            f'/api/editing-requests/{editing.id}/files/',
            {'file': bad_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)

    def test_upload_rejects_other_customers_request(self):
        other = User.objects.create_user(
            username='other@test.com', email='other@test.com', password='pass'
        )
        editing = EditingRequest.objects.create(
            customer=other,
            style_notes='test notes',
            turnaround='Within 1 week (email delivery)',
            package='standard',
            quoted_price='5.00',
        )
        self.client.force_authenticate(user=self.customer)
        from django.core.files.uploadedfile import SimpleUploadedFile
        fake_image = SimpleUploadedFile('photo.jpg', b'data', content_type='image/jpeg')
        res = self.client.post(
            f'/api/editing-requests/{editing.id}/files/',
            {'file': fake_image},
            format='multipart',
        )
        self.assertEqual(res.status_code, 404)

    def _add_files(self, editing, n):
        from django.core.files.uploadedfile import SimpleUploadedFile
        for i in range(n):
            f = SimpleUploadedFile(f'photo{i}.jpg', b'data', content_type='image/jpeg')
            res = self.client.post(
                f'/api/editing-requests/{editing.id}/files/',
                {'file': f},
                format='multipart',
            )
            self.assertEqual(res.status_code, 201)

    def test_checkout_standard_package(self):
        from django.test.utils import override_settings
        self.client.force_authenticate(user=self.customer)
        with override_settings(STRIPE_SECRET_KEY=''):
            create = self.client.post('/api/editing-requests/', {
                'style_notes': 'warm tones',
                'package': 'standard',
            }, format='json')
            editing_id = create.data['id']
            editing = EditingRequest.objects.get(pk=editing_id)
            self._add_files(editing, 2)
            res = self.client.post(f'/api/editing-requests/{editing_id}/checkout/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'confirmed')
        self.assertEqual(res.data['quoted_price'], '5.00')
        self.assertIsNotNone(res.data['payment']['payment_link_url'])
        payment = Payment.objects.get(editing_request_id=editing_id)
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(float(payment.amount), 5.00)

    def test_checkout_rejects_too_few_files(self):
        from django.test.utils import override_settings
        self.client.force_authenticate(user=self.customer)
        with override_settings(STRIPE_SECRET_KEY=''):
            create = self.client.post('/api/editing-requests/', {
                'style_notes': 'warm tones',
                'package': 'standard',
            }, format='json')
            editing_id = create.data['id']
            res = self.client.post(f'/api/editing-requests/{editing_id}/checkout/')
        self.assertEqual(res.status_code, 400)

    def test_upload_rejects_over_package_max(self):
        self.client.force_authenticate(user=self.customer)
        create = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones',
            'package': 'standard',
        }, format='json')
        editing_id = create.data['id']
        editing = EditingRequest.objects.get(pk=editing_id)
        self._add_files(editing, 3)
        from django.core.files.uploadedfile import SimpleUploadedFile
        extra = SimpleUploadedFile('extra.jpg', b'data', content_type='image/jpeg')
        res = self.client.post(
            f'/api/editing-requests/{editing_id}/files/',
            {'file': extra},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)


class MessageAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='cust@example.com', email='cust@example.com', password='pass'
        )
        self.other_customer = User.objects.create_user(
            username='other@example.com', email='other@example.com', password='pass'
        )
        self.staff = User.objects.create_user(
            username='staff@example.com', email='staff@example.com', password='pass',
            is_staff=True
        )
        self.editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='warm tones, natural light',
            turnaround='2 weeks',
        )
        self.booking = BookingRequest.objects.create(
            customer=self.customer,
            session_type='portrait',
            location='Christchurch Meadow',
            postcode='OX1 1DP',
        )

    def _token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        return str(RefreshToken.for_user(user).access_token)

    def test_threads_requires_auth(self):
        resp = self.client.get('/api/messages/threads/')
        self.assertEqual(resp.status_code, 401)

    def test_customer_threads_returns_grouped_structure(self):
        Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.staff, body='Hello', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.get('/api/messages/threads/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('editing', data)
        self.assertIn('booking', data)
        thread = data['editing'][0]
        self.assertEqual(thread['thread_id'], self.editing.id)
        self.assertEqual(thread['unread_count'], 1)
        self.assertIn('subject', thread)
        self.assertIn('last_message_body', thread)

    def test_staff_threads_returns_flat_list(self):
        Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.customer, body='Hi Kay', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.staff)}')
        resp = self.client.get('/api/messages/threads/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertEqual(data[0]['thread_type'], 'editing')
        self.assertEqual(data[0]['thread_id'], self.editing.id)
        self.assertIn('customer_email', data[0])

    def test_customer_cannot_read_other_customers_thread(self):
        other_editing = EditingRequest.objects.create(
            customer=self.other_customer,
            style_notes='B&W', turnaround='1 week',
        )
        Message.objects.create(
            thread_type='editing', thread_id=other_editing.id,
            sender=self.staff, body='Private', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.get(f'/api/messages/?thread_type=editing&thread_id={other_editing.id}')
        self.assertEqual(resp.status_code, 403)

    def test_send_message_creates_db_row(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.post('/api/messages/send/', {
            'thread_type': 'editing',
            'thread_id': self.editing.id,
            'body': 'Looking good!',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Message.objects.filter(body='Looking good!').exists())

    def test_send_message_empty_body_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.post('/api/messages/send/', {
            'thread_type': 'editing',
            'thread_id': self.editing.id,
            'body': '   ',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_mark_read_marks_correct_messages(self):
        # Staff sends 2 messages to customer
        m1 = Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.staff, body='A', read_by_recipient=False
        )
        m2 = Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.staff, body='B', read_by_recipient=False
        )
        # Other thread — should not be touched
        other_editing = EditingRequest.objects.create(
            customer=self.customer, style_notes='Other', turnaround='1w'
        )
        m3 = Message.objects.create(
            thread_type='editing', thread_id=other_editing.id,
            sender=self.staff, body='C', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.post('/api/messages/read/', {
            'thread_type': 'editing',
            'thread_id': self.editing.id,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        m1.refresh_from_db(); m2.refresh_from_db(); m3.refresh_from_db()
        self.assertTrue(m1.read_by_recipient)
        self.assertTrue(m2.read_by_recipient)
        self.assertFalse(m3.read_by_recipient)  # different thread, untouched

    def test_message_list_includes_system_message(self):
        Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.staff, body='Hi', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.customer)}')
        resp = self.client.get(f'/api/messages/?thread_type=editing&thread_id={self.editing.id}')
        self.assertEqual(resp.status_code, 200)
        messages = resp.json()
        self.assertTrue(messages[0]['is_system'])

    def test_staff_can_read_any_thread(self):
        Message.objects.create(
            thread_type='editing', thread_id=self.editing.id,
            sender=self.customer, body='Hello Kay', read_by_recipient=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self._token(self.staff)}')
        resp = self.client.get(f'/api/messages/?thread_type=editing&thread_id={self.editing.id}')
        self.assertEqual(resp.status_code, 200)


def _make_ws_app():
    """Return the WebSocket URLRouter wrapped with InMemoryChannelLayer, bypassing AllowedHostsOriginValidator."""
    from channels.routing import URLRouter
    from channels.layers import InMemoryChannelLayer
    from django.urls import re_path
    from django.test.utils import override_settings
    from content.consumers import ChatConsumer, NotificationConsumer

    websocket_urlpatterns = [
        re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
        re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
    ]
    app = URLRouter(websocket_urlpatterns)
    # Attach in-memory channel layer
    channel_layer = InMemoryChannelLayer()
    app.channel_layer = channel_layer
    return app, channel_layer


class WebSocketTests(TestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            username='ws_cust@example.com', email='ws_cust@example.com', password='pass'
        )
        self.staff = User.objects.create_user(
            username='ws_staff@example.com', email='ws_staff@example.com', password='pass',
            is_staff=True
        )
        self.editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='test',
            turnaround='1 week',
        )

    def _token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        return str(RefreshToken.for_user(user).access_token)

    def _make_app(self):
        from channels.routing import URLRouter
        from channels.layers import InMemoryChannelLayer
        from django.urls import re_path
        from content.consumers import ChatConsumer, NotificationConsumer

        websocket_urlpatterns = [
            re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
            re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
        ]
        channel_layer = InMemoryChannelLayer()

        from django.test.utils import override_settings
        import channels
        app = URLRouter(websocket_urlpatterns)
        return app, channel_layer

    def test_chat_connect_valid_jwt(self):
        from asgiref.sync import async_to_sync
        async_to_sync(self._async_test_chat_connect_valid_jwt)()

    async def _async_test_chat_connect_valid_jwt(self):
        from channels.routing import URLRouter
        from channels.layers import InMemoryChannelLayer
        from django.urls import re_path
        from content.consumers import ChatConsumer, NotificationConsumer
        from django.test.utils import override_settings

        websocket_urlpatterns = [
            re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
            re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
        ]
        app = URLRouter(websocket_urlpatterns)

        token = self._token(self.customer)
        communicator = WebsocketCommunicator(
            app,
            f'/ws/chat/editing/{self.editing.id}/?token={token}'
        )
        communicator.scope['channel_layer'] = InMemoryChannelLayer()
        with override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}):
            connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.disconnect()

    def test_chat_connect_invalid_jwt_rejected(self):
        from asgiref.sync import async_to_sync
        async_to_sync(self._async_test_chat_connect_invalid_jwt_rejected)()

    async def _async_test_chat_connect_invalid_jwt_rejected(self):
        from channels.routing import URLRouter
        from channels.layers import InMemoryChannelLayer
        from django.urls import re_path
        from content.consumers import ChatConsumer, NotificationConsumer
        from django.test.utils import override_settings

        websocket_urlpatterns = [
            re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
            re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
        ]
        app = URLRouter(websocket_urlpatterns)

        communicator = WebsocketCommunicator(
            app,
            f'/ws/chat/editing/{self.editing.id}/?token=invalid_token'
        )
        with override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}):
            connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4003)

    def test_chat_unauthorized_thread_rejected(self):
        from asgiref.sync import async_to_sync
        async_to_sync(self._async_test_chat_unauthorized_thread_rejected)()

    async def _async_test_chat_unauthorized_thread_rejected(self):
        """Customer cannot connect to another customer's thread."""
        from channels.routing import URLRouter
        from channels.layers import InMemoryChannelLayer
        from django.urls import re_path
        from content.consumers import ChatConsumer, NotificationConsumer
        from django.test.utils import override_settings

        websocket_urlpatterns = [
            re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
            re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
        ]
        app = URLRouter(websocket_urlpatterns)

        other_customer = await database_sync_to_async(User.objects.create_user)(
            username='other_ws@example.com', email='other_ws@example.com', password='pass'
        )
        other_editing = await database_sync_to_async(EditingRequest.objects.create)(
            customer=other_customer, style_notes='private', turnaround='1w'
        )
        token = self._token(self.customer)
        communicator = WebsocketCommunicator(
            app,
            f'/ws/chat/editing/{other_editing.id}/?token={token}'
        )
        with override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}):
            connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4003)

    def test_notification_connect_valid_jwt(self):
        from asgiref.sync import async_to_sync
        async_to_sync(self._async_test_notification_connect_valid_jwt)()

    async def _async_test_notification_connect_valid_jwt(self):
        from channels.routing import URLRouter
        from channels.layers import InMemoryChannelLayer
        from django.urls import re_path
        from content.consumers import ChatConsumer, NotificationConsumer
        from django.test.utils import override_settings

        websocket_urlpatterns = [
            re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
            re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
        ]
        app = URLRouter(websocket_urlpatterns)

        token = self._token(self.customer)
        communicator = WebsocketCommunicator(
            app,
            f'/ws/notifications/?token={token}'
        )
        with override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}):
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            # Should immediately receive current unread count
            response = await communicator.receive_json_from()
        self.assertEqual(response['type'], 'unread_count')
        self.assertIn('count', response)
        await communicator.disconnect()

    def test_notification_connect_invalid_jwt_rejected(self):
        from asgiref.sync import async_to_sync
        async_to_sync(self._async_test_notification_connect_invalid_jwt_rejected)()

    async def _async_test_notification_connect_invalid_jwt_rejected(self):
        from channels.routing import URLRouter
        from channels.layers import InMemoryChannelLayer
        from django.urls import re_path
        from content.consumers import ChatConsumer, NotificationConsumer
        from django.test.utils import override_settings

        websocket_urlpatterns = [
            re_path(r'^ws/chat/(?P<thread_type>booking|editing)/(?P<thread_id>\d+)/$', ChatConsumer.as_asgi()),
            re_path(r'^ws/notifications/$', NotificationConsumer.as_asgi()),
        ]
        app = URLRouter(websocket_urlpatterns)

        communicator = WebsocketCommunicator(
            app,
            '/ws/notifications/?token=bad'
        )
        with override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}):
            connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4003)


class PortfolioAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.staff = User.objects.create_user(
            username='staff@example.com', email='staff@example.com', password='pass', is_staff=True
        )
        self.cat, _ = Category.objects.get_or_create(
            name='Portfolio Test Cat', defaults={'slug': 'portfolio-test-cat'}
        )

    def test_public_portfolio_only_published(self):
        PortfolioItem.objects.create(
            title='Pub', category=self.cat, image='portfolio/a.jpg', published=True
        )
        PortfolioItem.objects.create(
            title='Hidden', category=self.cat, image='portfolio/b.jpg', published=False
        )
        res = self.client.get('/api/portfolio/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_public_portfolio_excludes_slideshow_only(self):
        PortfolioItem.objects.create(
            title='In grid', category=self.cat, image='portfolio/c.jpg',
            published=True, show_in_portfolio=True,
        )
        PortfolioItem.objects.create(
            title='Hero only', category=self.cat, image='portfolio/d.jpg',
            published=True, show_in_portfolio=False,
        )
        res = self.client.get('/api/portfolio/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['title'], 'In grid')

    def test_public_hero_includes_slideshow_only(self):
        item = PortfolioItem.objects.create(
            title='Hero only', category=self.cat, image='portfolio/e.jpg',
            published=True, show_in_portfolio=False,
        )
        slot = HeroSlot.objects.get(slot_number=1)
        slot.portfolio_item = item
        slot.save()
        res = self.client.get('/api/portfolio/hero/')
        self.assertEqual(res.status_code, 200)
        titles = [s['title'] for s in res.data]
        self.assertIn('Hero only', titles)

    def test_admin_category_crud(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post('/api/admin/portfolio/categories/', {'name': 'Fine Art Portraits'}, format='json')
        self.assertEqual(res.status_code, 201)
        cat_id = res.data['id']
        res = self.client.patch(f'/api/admin/portfolio/categories/{cat_id}/', {'name': 'Portraits'}, format='json')
        self.assertEqual(res.status_code, 200)
        res = self.client.delete(f'/api/admin/portfolio/categories/{cat_id}/')
        self.assertEqual(res.status_code, 200)


class DashboardAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.user = User.objects.create_user(
            username='cust@example.com', email='cust@example.com', password='pass'
        )

    def test_dashboard_requires_auth(self):
        res = self.client.get('/api/dashboard/')
        self.assertEqual(res.status_code, 401)

    def test_dashboard_returns_user_bookings(self):
        BookingRequest.objects.create(
            customer=self.user, session_type='portrait', location='Studio', postcode='OX1 1AA'
        )
        self.client.force_authenticate(user=self.user)
        res = self.client.get('/api/dashboard/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['bookings']), 1)


class BookingSlotReleaseTests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.staff = User.objects.create_user(
            username='staff2@example.com', email='staff2@example.com', password='pass', is_staff=True
        )
        self.customer = User.objects.create_user(
            username='cust2@example.com', email='cust2@example.com', password='pass'
        )
        self.slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 8, 1), block='morning', status='available', is_booked=True
        )
        self.booking = BookingRequest.objects.create(
            customer=self.customer, session_type='portrait',
            location='Home', postcode='OX1 1AA', slot=self.slot, status='pending',
        )

    def test_cancel_frees_slot(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.patch(
            f'/api/admin/bookings/{self.booking.id}/status/',
            {'status': 'cancelled'}, format='json'
        )
        self.assertEqual(res.status_code, 200)
        self.slot.refresh_from_db()
        self.assertFalse(self.slot.is_booked)


class PaymentWebhookTests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.user = User.objects.create_user(
            username='pay@example.com', email='pay@example.com', password='pass'
        )
        self.booking = BookingRequest.objects.create(
            customer=self.user, session_type='portrait', location='Studio', postcode='OX1 1AA',
            status='confirmed',
        )
        self.payment = Payment.objects.create(
            booking=self.booking, amount='150.00', status='pending',
            stripe_checkout_session_id='dev_session_1',
        )

    def test_dev_mark_paid(self):
        from django.test.utils import override_settings
        with override_settings(STRIPE_SECRET_KEY=''):
            res = self.client.post(
                '/api/payments/dev-mark-paid/',
                {'payment_id': self.payment.id}, format='json'
            )
        self.assertEqual(res.status_code, 200)
        self.payment.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(self.payment.status, 'paid')
        self.assertEqual(self.booking.status, 'confirmed')


class EditingPaymentTests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.staff = User.objects.create_user(
            username='edit_staff@example.com', email='edit_staff@example.com',
            password='pass', is_staff=True,
        )
        self.customer = User.objects.create_user(
            username='edit_cust@example.com', email='edit_cust@example.com', password='pass',
        )
        self.editing = EditingRequest.objects.create(
            customer=self.customer,
            style_notes='Warm tones',
            turnaround='5 days',
            status='requested',
        )

    def test_send_payment_creates_checkout(self):
        from django.test.utils import override_settings
        self.client.force_authenticate(user=self.staff)
        with override_settings(STRIPE_SECRET_KEY=''):
            res = self.client.post(
                f'/api/admin/editing-requests/{self.editing.id}/send-payment/',
                {'quoted_price': 85.00},
                format='json',
            )
        self.assertEqual(res.status_code, 200)
        self.editing.refresh_from_db()
        self.assertEqual(self.editing.status, 'confirmed')
        self.assertEqual(float(self.editing.quoted_price), 85.00)
        payment = Payment.objects.get(editing_request=self.editing)
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(float(payment.amount), 85.00)
        self.assertIn('dev-', payment.payment_link_url)
        self.assertTrue(
            Message.objects.filter(
                thread_type='editing',
                thread_id=self.editing.id,
                body__contains='Payment request sent',
            ).exists()
        )

    def test_confirm_status_does_not_create_payment(self):
        from django.test.utils import override_settings
        self.client.force_authenticate(user=self.staff)
        self.editing.quoted_price = 85.00
        self.editing.save()
        with override_settings(STRIPE_SECRET_KEY=''):
            res = self.client.patch(
                f'/api/admin/editing-requests/{self.editing.id}/status/',
                {'status': 'confirmed'},
                format='json',
            )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Payment.objects.filter(editing_request=self.editing).exists())

    def test_send_payment_requires_price(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            f'/api/admin/editing-requests/{self.editing.id}/send-payment/',
            {},
            format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_send_payment_rejected_when_already_paid(self):
        Payment.objects.create(
            editing_request=self.editing,
            amount='85.00',
            status='paid',
            stripe_payment_intent_id='pi_paid_1',
        )
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            f'/api/admin/editing-requests/{self.editing.id}/send-payment/',
            {'quoted_price': 90.00},
            format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_resend_payment_updates_amount(self):
        from django.test.utils import override_settings
        self.client.force_authenticate(user=self.staff)
        with override_settings(STRIPE_SECRET_KEY=''):
            res1 = self.client.post(
                f'/api/admin/editing-requests/{self.editing.id}/send-payment/',
                {'quoted_price': 85.00},
                format='json',
            )
            self.assertEqual(res1.status_code, 200)
            res2 = self.client.post(
                f'/api/admin/editing-requests/{self.editing.id}/send-payment/',
                {'quoted_price': 95.00},
                format='json',
            )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(Payment.objects.filter(editing_request=self.editing).count(), 1)
        payment = Payment.objects.get(editing_request=self.editing)
        self.assertEqual(float(payment.amount), 95.00)
        self.editing.refresh_from_db()
        self.assertEqual(float(self.editing.quoted_price), 95.00)

    def test_admin_editing_list_includes_payment(self):
        from django.test.utils import override_settings
        self.client.force_authenticate(user=self.staff)
        with override_settings(STRIPE_SECRET_KEY=''):
            self.client.post(
                f'/api/admin/editing-requests/{self.editing.id}/send-payment/',
                {'quoted_price': 85.00},
                format='json',
            )
        res = self.client.get('/api/admin/editing-requests/')
        self.assertEqual(res.status_code, 200)
        row = next(item for item in res.data if item['id'] == self.editing.id)
        self.assertIsNotNone(row['payment'])
        self.assertEqual(row['payment']['status'], 'pending')
        self.assertEqual(float(row['payment']['amount']), 85.00)


class AddressLookupAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()

    def test_addresses_requires_postcode(self):
        res = self.client.get('/api/service-area/addresses/')
        self.assertEqual(res.status_code, 400)

    def test_addresses_empty_without_api_key(self):
        from django.test.utils import override_settings
        from unittest.mock import patch
        with override_settings(GETADDRESS_API_KEY=''):
            with patch(
                'content.views._geocode_postcode',
                return_value=(51.75, -1.27, {
                    'postcode': 'OX2 0AN',
                    'admin_ward': 'Osney & St Thomas',
                    'admin_district': 'Oxford',
                    'parish': '',
                }),
            ):
                res = self.client.get('/api/service-area/addresses/?postcode=OX2+0AN')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data['addresses']), 1)
        self.assertEqual(res.data['source'], 'postcodes.io')

    def test_addresses_getaddress_401_falls_back(self):
        from django.test.utils import override_settings
        from unittest.mock import patch, MagicMock
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = 'Unauthorized'
        with override_settings(GETADDRESS_API_KEY='fake-key', FRONTEND_URL='http://localhost:5173'):
            with patch(
                'content.views._geocode_postcode',
                return_value=(51.75, -1.27, {
                    'postcode': 'OX2 0AN',
                    'admin_ward': 'Osney & St Thomas',
                    'admin_district': 'Oxford',
                    'parish': '',
                }),
            ):
                with patch('content.views.requests.get', return_value=mock_resp):
                    res = self.client.get('/api/service-area/addresses/?postcode=OX2+0AN')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data['addresses']), 1)
        self.assertIn('warning', res.data)

    def test_check_empty_polygon_returns_false_when_geocode_ok(self):
        from unittest.mock import patch
        ServiceArea.get()
        with patch('content.views._geocode_postcode', return_value=(51.75, -1.27, {})):
            res = self.client.post(
                '/api/service-area/check/',
                {'postcode': 'OX2 0AN'},
                format='json',
            )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['is_within_zone'])


class AccessInstructionsBookingTests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='access@test.com', email='access@test.com', password='pass',
        )

    def test_create_studio_booking_with_notes(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'session_type': 'portrait',
            'phone': '07475338565',
            'notes': 'Warm tones, family of four',
            'preferred_schedule': 'Saturday afternoon',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        booking = BookingRequest.objects.get(pk=res.data['id'])
        self.assertEqual(booking.notes, 'Warm tones, family of four')
        self.assertEqual(booking.phone, '07475338565')
        self.assertEqual(booking.preferred_schedule, 'Saturday afternoon')
        self.assertFalse(booking.is_home_visit)
        self.assertEqual(booking.access_instructions, '')


class GeoBlockMiddlewareTests(TestCase):
    def setUp(self):
        self.client = DRFClient()

    def test_blocks_mexico_via_cloudflare_header(self):
        res = self.client.get(
            '/api/portfolio/',
            HTTP_CF_IPCOUNTRY='MX',
            REMOTE_ADDR='187.188.1.1',
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json().get('code'), 'region_blocked')

    def test_allows_non_blocked_country(self):
        res = self.client.get(
            '/api/portfolio/',
            HTTP_CF_IPCOUNTRY='GB',
            REMOTE_ADDR='81.2.69.142',
        )
        self.assertEqual(res.status_code, 200)

    def test_allows_localhost(self):
        res = self.client.get('/api/portfolio/', REMOTE_ADDR='127.0.0.1')
        self.assertEqual(res.status_code, 200)
