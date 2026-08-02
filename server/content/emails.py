from backend.mail import send_app_email


def send_booking_confirmation_email(booking, payment_url: str):
    subject = 'Your booking request has been confirmed — payment required'
    body = (
        f"Hi {booking.customer.first_name or booking.customer.email},\n\n"
        f"Photolux Oxford has confirmed your {booking.session_type} photography session.\n"
        f"Location: Studio session"
    )
    if booking.location:
        body += f" ({booking.location})"
    body += "\n"
    if booking.phone:
        body += f"Phone: {booking.phone}\n"
    if booking.preferred_schedule:
        body += f"Preferred timing: {booking.preferred_schedule}\n"
    elif booking.slot:
        body += f"Date: {booking.slot.date} ({booking.slot.block})\n"
    if booking.notes:
        body += f"Notes: {booking.notes}\n"
    body += f"\nPlease complete payment here:\n{payment_url}\n\n"
    body += "Thank you,\nPhotolux Oxford\n"
    send_app_email(to_email=booking.customer.email, subject=subject, text_body=body)


def send_editing_payment_email(editing, payment_url: str):
    subject = 'Complete payment for your photo editing request'
    package_line = ''
    if editing.package:
        package_line = f"Package: {editing.package}\n"
    body = (
        f"Hi {editing.customer.first_name or editing.customer.email},\n\n"
        f"Thanks for submitting your photos for editing.\n"
        f"{package_line}"
        f"Amount due: £{editing.quoted_price}\n"
        f"Turnaround: edited photos are returned by email within 1 week. "
        f"If delivery takes longer, you are eligible for compensation.\n"
        f"Editing does not book a calendar session slot.\n\n"
        f"Please complete payment here:\n{payment_url}\n\n"
        f"Thank you,\nPhotolux Oxford\n"
    )
    send_app_email(to_email=editing.customer.email, subject=subject, text_body=body)
