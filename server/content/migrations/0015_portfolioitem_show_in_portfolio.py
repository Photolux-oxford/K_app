from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0014_servicearea_studio_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='portfolioitem',
            name='show_in_portfolio',
            field=models.BooleanField(
                default=True,
                help_text='If off (and published), the photo can still appear in the hero slideshow only.',
            ),
        ),
    ]
