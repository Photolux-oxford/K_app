from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from unittest.mock import patch

from accounts.models import EmailVerification


@override_settings(DEBUG=True)
class RegisterTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch('accounts.views.send_verification_code_email', return_value=True)
    def test_register_requires_verification(self, _mock_send):
        res = self.client.post('/api/auth/register/', {
            'email': 'new@example.com',
            'password': 'securepass123',
            'first_name': 'Jane',
            'last_name': 'Doe',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['requires_verification'])
        self.assertEqual(res.data['email'], 'new@example.com')
        self.assertNotIn('access', res.data)
        user = User.objects.get(username='new@example.com')
        self.assertFalse(user.is_active)
        self.assertTrue(EmailVerification.objects.filter(user=user).exists())
        self.assertIn('debug_code', res.data)

    def test_register_duplicate_active_email_returns_400(self):
        User.objects.create_user(
            username='taken@example.com', email='taken@example.com',
            password='pass', is_active=True,
        )
        res = self.client.post('/api/auth/register/', {
            'email': 'taken@example.com', 'password': 'securepass123'
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('error', res.data)

    def test_register_short_password_returns_400(self):
        res = self.client.post('/api/auth/register/', {
            'email': 'new2@example.com', 'password': 'short'
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_register_missing_email_returns_400(self):
        res = self.client.post('/api/auth/register/', {
            'password': 'securepass123'
        }, format='json')
        self.assertEqual(res.status_code, 400)


@override_settings(DEBUG=True)
class VerifyEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch('accounts.views.send_verification_code_email', return_value=True)
    def test_verify_activates_user_and_returns_tokens(self, _mock_send):
        reg = self.client.post('/api/auth/register/', {
            'email': 'verify@example.com',
            'password': 'securepass123',
            'first_name': 'V',
        }, format='json')
        code = reg.data['debug_code']
        res = self.client.post('/api/auth/verify/', {
            'email': 'verify@example.com',
            'code': code,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)
        user = User.objects.get(username='verify@example.com')
        self.assertTrue(user.is_active)
        self.assertFalse(EmailVerification.objects.filter(user=user).exists())

    @patch('accounts.views.send_verification_code_email', return_value=True)
    def test_verify_wrong_code_returns_400(self, _mock_send):
        self.client.post('/api/auth/register/', {
            'email': 'badcode@example.com',
            'password': 'securepass123',
        }, format='json')
        res = self.client.post('/api/auth/verify/', {
            'email': 'badcode@example.com',
            'code': '000000',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.get(username='badcode@example.com').is_active)

    @patch('accounts.views.send_verification_code_email', return_value=True)
    def test_unverified_user_cannot_login(self, _mock_send):
        self.client.post('/api/auth/register/', {
            'email': 'nologin@example.com',
            'password': 'securepass123',
        }, format='json')
        res = self.client.post('/api/auth/token/', {
            'username': 'nologin@example.com',
            'password': 'securepass123',
        }, format='json')
        self.assertEqual(res.status_code, 401)


class LoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User.objects.create_user(
            username='user@example.com',
            email='user@example.com',
            password='testpass123',
            is_active=True,
        )

    def test_login_success_returns_access_and_refresh(self):
        res = self.client.post('/api/auth/token/', {
            'username': 'user@example.com',
            'password': 'testpass123',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)

    def test_login_wrong_password_returns_401(self):
        res = self.client.post('/api/auth/token/', {
            'username': 'user@example.com',
            'password': 'wrongpass',
        }, format='json')
        self.assertEqual(res.status_code, 401)


class MeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='me@example.com',
            email='me@example.com',
            password='pass123',
            first_name='Kay',
            is_active=True,
        )

    def test_me_authenticated_returns_user_data(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['email'], 'me@example.com')
        self.assertEqual(res.data['first_name'], 'Kay')


@override_settings(GOOGLE_CLIENT_ID='test-google-client-id.apps.googleusercontent.com')
class GoogleLoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_google_not_configured_returns_503(self):
        with override_settings(GOOGLE_CLIENT_ID=''):
            res = self.client.post('/api/auth/google/', {
                'credential': 'fake-token',
            }, format='json')
        self.assertEqual(res.status_code, 503)

    def test_google_missing_credential_returns_400(self):
        res = self.client.post('/api/auth/google/', {}, format='json')
        self.assertEqual(res.status_code, 400)

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_google_creates_new_user(self, mock_verify):
        mock_verify.return_value = {
            'email': 'google.user@example.com',
            'email_verified': True,
            'given_name': 'Gigi',
            'family_name': 'User',
        }
        res = self.client.post('/api/auth/google/', {
            'credential': 'valid-google-id-token',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)
        self.assertEqual(res.data['user']['email'], 'google.user@example.com')
        user = User.objects.get(username='google.user@example.com')
        self.assertTrue(user.is_active)
        self.assertFalse(user.has_usable_password())

    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_google_activates_pending_email_user(self, mock_verify):
        user = User.objects.create_user(
            username='pending@example.com',
            email='pending@example.com',
            password='temp12345',
            is_active=False,
        )
        EmailVerification.objects.create(user=user, code='123456')
        mock_verify.return_value = {
            'email': 'pending@example.com',
            'email_verified': True,
            'given_name': 'Pending',
        }
        res = self.client.post('/api/auth/google/', {
            'credential': 'valid-google-id-token',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertFalse(EmailVerification.objects.filter(user=user).exists())

    @patch('google.oauth2.id_token.verify_oauth2_token', side_effect=ValueError('bad'))
    def test_google_invalid_token_returns_400(self, _mock_verify):
        res = self.client.post('/api/auth/google/', {
            'credential': 'bad-token',
        }, format='json')
        self.assertEqual(res.status_code, 400)
