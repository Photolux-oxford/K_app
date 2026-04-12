from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('content', '0004_availabilityslot_editable_max_length'),
    ]
    operations = [
        migrations.RenameField(
            model_name='message',
            old_name='is_read',
            new_name='read_by_recipient',
        ),
    ]
