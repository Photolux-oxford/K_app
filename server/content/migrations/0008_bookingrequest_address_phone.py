from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0007_bookingrequest_access_instructions'),
    ]

    operations = [
        migrations.AddField(
            model_name='bookingrequest',
            name='address_line_1',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='bookingrequest',
            name='address_line_2',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='bookingrequest',
            name='phone',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
    ]
