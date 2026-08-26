import {
  safeDownloadName,
  downloadProxyHref,
  isHostingerUploadUrl,
  downloadFileToDevice,
} from './files';

describe('invoice download helpers', () => {
  test('keeps .pdf on invoice file names with spaces', () => {
    expect(safeDownloadName('Invoice 5360 (1).pdf')).toBe('Invoice 5360 (1).pdf');
  });

  test('adds .pdf when the invoice mime is pdf but the label has no extension', () => {
    expect(safeDownloadName('الفواتير', '', 'application/pdf')).toBe('الفواتير.pdf');
  });

  test('builds the Vercel attachment proxy for Hostinger invoice URLs', () => {
    const src = 'https://www.csapp.io/teamwork-api/uploads/1787660215778-oifha2zkt.pdf';
    expect(isHostingerUploadUrl(src)).toBe(true);
    const href = downloadProxyHref(src, 'Invoice_5360 (1).pdf');
    expect(href.startsWith('https://teamwork.csapp.io/api/download?')).toBe(true);
    expect(href).toContain(encodeURIComponent(src));
    expect(href).toContain(encodeURIComponent('Invoice_5360 (1).pdf'));
  });

  test('navigates to the attachment proxy instead of a CORS fetch', async () => {
    const clicks: { href: string; download: string }[] = [];
    const orig = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag);
      if (tag === 'a') {
        const click = el.click.bind(el);
        el.click = () => {
          clicks.push({ href: el.getAttribute('href') || '', download: el.download });
          click();
        };
      }
      return el;
    });

    await downloadFileToDevice(
      'https://www.csapp.io/teamwork-api/uploads/abc-123.pdf',
      'Invoice 5249.pdf',
    );

    expect(clicks).toHaveLength(1);
    expect(clicks[0].href).toContain('https://teamwork.csapp.io/api/download?');
    expect(clicks[0].href).toContain(encodeURIComponent('Invoice 5249.pdf'));
    expect(clicks[0].download).toBe('');
  });
});
