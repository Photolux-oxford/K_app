from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0006_portfolio_admin_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='bookingrequest',
            name='access_instructions',
            field=models.TextField(blank=True),
        ),
    ]
