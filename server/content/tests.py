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
