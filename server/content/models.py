import datetime

from django.db import models
from django.contrib.auth.models import User
from django.utils.text import slugify


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']
        verbose_name_plural = 'categories'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class PortfolioItem(models.Model):
    title = models.CharField(max_length=200, blank=True)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name='items'
    )
    image = models.ImageField(upload_to='portfolio/')
    published = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', '-created_at']

    def __str__(self):
        return self.title or f'Portfolio #{self.pk}'


class HeroSlot(models.Model):
    FIT_CHOICES = [
        ('cover', 'Cover (fill & crop)'),
        ('contain', 'Contain (show full image)'),
    ]

    slot_number = models.PositiveSmallIntegerField(unique=True)
    portfolio_item = models.ForeignKey(
        PortfolioItem, null=True, blank=True, on_delete=models.SET_NULL, related_name='hero_slots'
    )
    position_x = models.SmallIntegerField(default=50, help_text='Horizontal focal point 0-100 (left to right)')
    position_y = models.SmallIntegerField(default=50, help_text='Vertical focal point 0-100 (top to bottom)')
    fit_mode = models.CharField(max_length=10, choices=FIT_CHOICES, default='cover')

    class Meta:
        ordering = ['slot_number']

    def __str__(self):
        return f'Hero slot {self.slot_number}'


class AvailabilitySlot(models.Model):
    BLOCK_CHOICES = [
        ('morning',   'Morning'),
        ('afternoon', 'Afternoon'),
        ('evening',   'Evening'),
    ]
    STATUS_CHOICES = [
        ('available',   'Available'),
        ('potential',   'Potential'),
        ('unavailable', 'Unavailable'),
    ]
    # Auto-filled into start_time/end_time by save() — times are hardcoded business rules
    BLOCK_TIMES = {
        'morning':   (datetime.time(8, 0),  datetime.time(11, 0)),
        'afternoon': (datetime.time(12, 0), datetime.time(15, 0)),
        'evening':   (datetime.time(16, 0), datetime.time(20, 0)),
    }

    date       = models.DateField()
    block      = models.CharField(max_length=20, choices=BLOCK_CHOICES)
    start_time = models.TimeField(editable=False)
    end_time   = models.TimeField(editable=False)
    status     = models.CharField(max_length=15, choices=STATUS_CHOICES)
    is_booked  = models.BooleanField(default=False)

    class Meta:
        ordering = ['date', 'block']
        unique_together = ['date', 'block']

    def save(self, *args, **kwargs):
        times = self.BLOCK_TIMES.get(self.block)
        if times is None:
            raise ValueError(
                f"Invalid block value '{self.block}'. "
                f"Must be one of: {list(self.BLOCK_TIMES)}"
            )
        self.start_time, self.end_time = times
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.date} {self.block} ({self.status})"


class BookingRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
        ('completed', 'Completed'),
    ]
    SESSION_TYPES = [
        ('wedding', 'Wedding'),
        ('portrait', 'Portrait'),
        ('event', 'Event'),
        ('landscape', 'Landscape'),
        ('product', 'Product'),
    ]
    customer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bookings')
    session_type = models.CharField(max_length=50, choices=SESSION_TYPES)
    location = models.CharField(max_length=300)
    address_line_1 = models.CharField(max_length=200, blank=True, default='')
    address_line_2 = models.CharField(max_length=200, blank=True, default='')
    postcode = models.CharField(max_length=10)
    phone = models.CharField(max_length=30, blank=True, default='')
    is_home_visit = models.BooleanField(default=False)
    slot = models.OneToOneField(
        AvailabilitySlot, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='booking'
    )
    notes = models.TextField(blank=True)
    access_instructions = models.TextField(blank=True)
    quoted_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.customer.email} — {self.session_type} ({self.status})"


class EditingRequest(models.Model):
    STATUS_CHOICES = [
        ('requested', 'Requested'),
        ('confirmed', 'Confirmed'),
        ('in_progress', 'In Progress'),
        ('delivered', 'Delivered'),
        ('declined', 'Declined'),
    ]
    customer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='editing_requests')
    style_notes = models.TextField()
    turnaround = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='requested')
    quoted_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.customer.email} — editing ({self.status})"


class EditingFile(models.Model):
    editing_request = models.ForeignKey(
        EditingRequest, on_delete=models.CASCADE, related_name='files'
    )
    file = models.FileField(upload_to='editing/')
    uploaded_at = models.DateTimeField(auto_now_add=True)


class Payment(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]
    booking = models.OneToOneField(
        BookingRequest, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='payment'
    )
    editing_request = models.OneToOneField(
        EditingRequest, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='payment'
    )
    stripe_payment_intent_id = models.CharField(max_length=200, unique=True, null=True, blank=True)
    stripe_checkout_session_id = models.CharField(max_length=500, blank=True, default='')
    payment_link_url = models.URLField(max_length=500, blank=True, default='')
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    currency = models.CharField(max_length=3, default='GBP')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    paid_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Payment {self.stripe_payment_intent_id} ({self.status})"


class Message(models.Model):
    THREAD_TYPES = [
        ('booking', 'Booking'),
        ('editing', 'Editing'),
    ]
    thread_type = models.CharField(max_length=20, choices=THREAD_TYPES)
    thread_id = models.PositiveBigIntegerField()
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='messages')
    body = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    read_by_recipient = models.BooleanField(default=False)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.thread_type}#{self.thread_id} from {self.sender.email}"


class ServiceArea(models.Model):
    """
    Singleton model. Always access via ServiceArea.get().
    Stores Kay's home-visit zone as a list of {"lat": float, "lng": float} dicts.
    """
    polygon = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1, defaults={'polygon': []})
        return obj

    def __str__(self):
        return f"ServiceArea ({len(self.polygon)} points)"
