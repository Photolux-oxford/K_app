from django.contrib import admin
from .models import (
    Category, HeroSlot, PortfolioItem, AvailabilitySlot, BookingRequest,
    EditingRequest, EditingFile, Payment, Message, ServiceArea
)

admin.site.register(Category)
admin.site.register(HeroSlot)
admin.site.register(PortfolioItem)
admin.site.register(AvailabilitySlot)
admin.site.register(BookingRequest)
admin.site.register(EditingRequest)
admin.site.register(EditingFile)
admin.site.register(Payment)
admin.site.register(Message)
admin.site.register(ServiceArea)
