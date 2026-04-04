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
        self.assertFalse(msg.is_read)


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
