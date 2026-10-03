import importlib.util
import tempfile
from pathlib import Path


project_root = Path(__file__).resolve().parents[1]
specification = importlib.util.spec_from_file_location('site_builder', project_root / 'scripts/build_site.py')
builder = importlib.util.module_from_spec(specification)
specification.loader.exec_module(builder)
configuration = {
    'siteUrl': 'https://invito.example',
    'turnstileSiteKey': 'production-site-fixture',
    'supabasePublishableKey': 'sb_publishable_fixture',
    'rsvpEndpoint': 'https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/rsvp',
}
with tempfile.TemporaryDirectory() as directory:
    fixture_root = Path(directory)
    builder.PROJECT_ROOT = fixture_root
    builder.OUTPUT_ROOT = fixture_root / 'output/site'
    for filename in ['index.html', 'admin.html', '404.html', '_headers']:
        (fixture_root / filename).write_text((project_root / filename).read_text())
    (fixture_root / 'assets').mkdir()
    (fixture_root / 'assets/app.js').write_text('const publicAsset = true;')
    (fixture_root / 'assets/README.md').write_text('Documentation')
    (fixture_root / '.env').write_text('PRIVATE_FIXTURE')
    (fixture_root / 'private').mkdir()
    (fixture_root / 'private/list.csv').write_text('PRIVATE_FIXTURE')
    output_root = builder.build_site(configuration)
    published_paths = {str(path.relative_to(output_root)) for path in output_root.rglob('*') if path.is_file()}
    assert published_paths == {'index.html', 'admin.html', '404.html', '_headers', 'assets/app.js', 'assets/site-config.js'}
    assert 'https://invito.example/' in (output_root / 'index.html').read_text()
    assert 'PRIVATE_FIXTURE' not in ''.join(path.read_text() for path in output_root.rglob('*') if path.is_file())
    for overrides in [{'siteUrl': 'http://invito.example'}, {'siteUrl': 'https://invito.example/path'},
                      {'turnstileSiteKey': '1x00000000000000000000AA'}, {'serviceKey': 'PRIVATE_FIXTURE'}]:
        try:
            builder.build_site({**configuration, **overrides})
        except ValueError:
            pass
        else:
            raise AssertionError('Unsafe configuration accepted')
    (fixture_root / 'assets/link.js').symlink_to(fixture_root / '.env')
    try:
        builder.build_site(configuration)
    except ValueError:
        pass
    else:
        raise AssertionError('Symlink accepted')
print('Build: solo file pubblici; segreti, documenti, symlink e configurazioni insicure esclusi.')
