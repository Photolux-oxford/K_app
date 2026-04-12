from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient as DRFClient
from .models import (
    PortfolioItem, AvailabilitySlot, BookingRequest,
    EditingRequest, EditingFile, Payment, Message, ServiceArea
)
import datetime

class ModelSmokeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='customer@example.com',
            email='customer@example.com',
            password='testpass123'
        )

    def test_portfolio_item_creation(self):
        item = PortfolioItem.objects.create(
            title='Wedding Shot', category='wedding', image='portfolio/test.jpg'
        )
        self.assertEqual(str(item), 'Wedding Shot')
        self.assertFalse(item.featured)
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


class AdminAvailabilityAPITests(TestCase):
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
        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/admin/availability/?month=2026-05')
        self.assertEqual(res.status_code, 403)

    def test_list_requires_month_param(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get('/api/admin/availability/')
        self.assertEqual(res.status_code, 400)

    def test_list_returns_slots_for_month(self):
        self.client.force_authenticate(user=self.staff)
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 6, 1), block='morning', status='available'
        )
        res = self.client.get('/api/admin/availability/?month=2026-05')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['block'], 'morning')

    def test_upsert_creates_slot(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post('/api/admin/availability/upsert/', {
            'date': '2026-05-01', 'block': 'morning', 'status': 'available'
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(AvailabilitySlot.objects.count(), 1)
        slot = AvailabilitySlot.objects.first()
        self.assertEqual(slot.start_time, datetime.time(8, 0))
        self.assertEqual(slot.end_time, datetime.time(11, 0))

    def test_upsert_updates_existing_slot(self):
        self.client.force_authenticate(user=self.staff)
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        res = self.client.post('/api/admin/availability/upsert/', {
            'date': '2026-05-01', 'block': 'morning', 'status': 'unavailable'
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(AvailabilitySlot.objects.count(), 1)
        self.assertEqual(AvailabilitySlot.objects.first().status, 'unavailable')

    def test_upsert_rejects_invalid_block(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post('/api/admin/availability/upsert/', {
            'date': '2026-05-01', 'block': 'lunchtime', 'status': 'available'
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_delete_removes_slot(self):
        self.client.force_authenticate(user=self.staff)
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        res = self.client.delete(f'/api/admin/availability/{slot.id}/')
        self.assertEqual(res.status_code, 204)
        self.assertEqual(AvailabilitySlot.objects.count(), 0)

    def test_delete_rejects_booked_slot(self):
        self.client.force_authenticate(user=self.staff)
        slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning',
            status='available', is_booked=True
        )
        res = self.client.delete(f'/api/admin/availability/{slot.id}/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(AvailabilitySlot.objects.count(), 1)


class CustomerAvailabilityAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()

    def test_requires_month_param(self):
        res = self.client.get('/api/availability/')
        self.assertEqual(res.status_code, 400)

    def test_returns_available_and_potential_slots_only(self):
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='afternoon', status='potential'
        )
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='evening', status='unavailable'
        )
        res = self.client.get('/api/availability/?month=2026-05')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)
        statuses = {s['status'] for s in res.data}
        self.assertNotIn('unavailable', statuses)

    def test_returns_booked_slots_with_is_booked_true(self):
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning',
            status='available', is_booked=True
        )
        res = self.client.get('/api/availability/?month=2026-05')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertTrue(res.data[0]['is_booked'])

    def test_filters_by_month(self):
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 1), block='morning', status='available'
        )
        AvailabilitySlot.objects.create(
            date=datetime.date(2026, 6, 1), block='morning', status='available'
        )
        res = self.client.get('/api/availability/?month=2026-05')
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['date'], '2026-05-01')


class CreateBookingAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='cust@test.com', email='cust@test.com', password='pass'
        )
        self.slot = AvailabilitySlot.objects.create(
            date=datetime.date(2026, 5, 10),
            block='morning',
            status='available',
        )

    def test_requires_authentication(self):
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
            'session_type': 'portrait',
            'location': 'Oxford',
            'postcode': 'OX1 1AA',
        }, format='json')
        self.assertEqual(res.status_code, 401)

    def test_creates_booking_and_marks_slot_booked(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
            'session_type': 'portrait',
            'location': 'Christchurch Meadow',
            'postcode': 'OX1 1AA',
            'notes': 'morning light preferred',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIn('id', res.data)
        self.assertEqual(res.data['status'], 'pending')
        self.slot.refresh_from_db()
        self.assertTrue(self.slot.is_booked)

    def test_rejects_already_booked_slot(self):
        self.client.force_authenticate(user=self.customer)
        self.slot.is_booked = True
        self.slot.save()
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
            'session_type': 'portrait',
            'location': 'Oxford',
            'postcode': 'OX1 1AA',
        }, format='json')
        self.assertEqual(res.status_code, 409)

    def test_rejects_invalid_session_type(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
            'session_type': 'circus',
            'location': 'Oxford',
            'postcode': 'OX1 1AA',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_rejects_missing_required_fields(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'slot_id': self.slot.id,
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_rejects_nonexistent_slot(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/bookings/', {
            'slot_id': 99999,
            'session_type': 'portrait',
            'location': 'Oxford',
            'postcode': 'OX1 1AA',
        }, format='json')
        self.assertEqual(res.status_code, 404)


class CreateEditingRequestAPITests(TestCase):
    def setUp(self):
        self.client = DRFClient()
        self.customer = User.objects.create_user(
            username='cust@test.com', email='cust@test.com', password='pass'
        )

    def test_requires_authentication(self):
        res = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones', 'turnaround': '1 week'
        }, format='json')
        self.assertEqual(res.status_code, 401)

    def test_creates_editing_request(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/editing-requests/', {
            'style_notes': 'warm tones, natural light',
            'turnaround': 'within 2 weeks',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIn('id', res.data)
        self.assertEqual(res.data['status'], 'requested')

    def test_rejects_missing_style_notes(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/editing-requests/', {
            'turnaround': '1 week'
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_rejects_missing_turnaround(self):
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
            turnaround='1 week',
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
            turnaround='1 week',
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
            turnaround='1 week',
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
            turnaround='1 week',
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
