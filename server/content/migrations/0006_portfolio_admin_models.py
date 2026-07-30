from django.db import migrations, models
import django.db.models.deletion


CATEGORY_LABELS = {
    'wedding': 'Wedding',
    'portrait': 'Portrait',
    'event': 'Event',
    'landscape': 'Landscape',
    'product': 'Product',
}


def migrate_portfolio_categories(apps, schema_editor):
    Category = apps.get_model('content', 'Category')
    PortfolioItem = apps.get_model('content', 'PortfolioItem')
    slug_map = {}
    for slug, name in CATEGORY_LABELS.items():
        cat, _ = Category.objects.get_or_create(
            slug=slug,
            defaults={'name': name, 'order': list(CATEGORY_LABELS.keys()).index(slug)},
        )
        slug_map[slug] = cat

    for item in PortfolioItem.objects.all():
        old_cat = item.category_old
        if old_cat and old_cat in slug_map:
            item.category = slug_map[old_cat]
        item.published = True
        item.save()


def seed_hero_slots(apps, schema_editor):
    HeroSlot = apps.get_model('content', 'HeroSlot')
    for n in range(1, 7):
        HeroSlot.objects.get_or_create(slot_number=n)


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0005_rename_is_read_message_read_by_recipient'),
    ]

    operations = [
        migrations.CreateModel(
            name='Category',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
                ('slug', models.SlugField(max_length=100, unique=True)),
                ('order', models.PositiveIntegerField(default=0)),
            ],
            options={
                'verbose_name_plural': 'categories',
                'ordering': ['order', 'name'],
            },
        ),
        migrations.AddField(
            model_name='portfolioitem',
            name='published',
            field=models.BooleanField(default=False),
        ),
        migrations.RenameField(
            model_name='portfolioitem',
            old_name='category',
            new_name='category_old',
        ),
        migrations.AddField(
            model_name='portfolioitem',
            name='category',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='items', to='content.category',
            ),
        ),
        migrations.AlterField(
            model_name='portfolioitem',
            name='title',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.RunPython(migrate_portfolio_categories, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='portfolioitem',
            name='category_old',
        ),
        migrations.RemoveField(
            model_name='portfolioitem',
            name='featured',
        ),
        migrations.CreateModel(
            name='HeroSlot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slot_number', models.PositiveSmallIntegerField(unique=True)),
                ('portfolio_item', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='hero_slots', to='content.portfolioitem',
                )),
            ],
            options={
                'ordering': ['slot_number'],
            },
        ),
        migrations.RunPython(seed_hero_slots, migrations.RunPython.noop),
        migrations.AddField(
            model_name='payment',
            name='stripe_checkout_session_id',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='payment',
            name='payment_link_url',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AlterField(
            model_name='payment',
            name='stripe_payment_intent_id',
            field=models.CharField(blank=True, max_length=200, null=True, unique=True),
        ),
    ]
