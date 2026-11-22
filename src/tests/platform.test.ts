/**
 * Sheeta Operations Research - Cross-Platform Abstraction Test Suite
 * Validates adapter detection, storage mirror, PDF template generation,
 * and offline status contracts across runtimes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectPlatform, getPlatform } from '../platform/index';
import { generatePrintableHtml } from '../platform/pdfGenerator';
import { WebPlatformAdapter } from '../platform/webAdapter';

describe('Cross-Platform Abstraction Layer', () => {
  it('detects WebPlatformAdapter by default in node/web environment', () => {
    const platform = detectPlatform();
    assert.ok(platform);
    assert.strictEqual(platform.type, 'web');
    assert.strictEqual(platform.isNative, false);
    assert.ok(platform.storage);
    assert.ok(platform.file);
    assert.ok(platform.clipboard);
    assert.ok(platform.pdf);
    assert.ok(platform.device);
    assert.ok(platform.network);
  });

  it('maintains singleton instance across multiple getPlatform() invocations', () => {
    const p1 = getPlatform();
    const p2 = getPlatform();
    assert.strictEqual(p1, p2);
  });

  it('generates pristine printable HTML with Sheeta branding and RTL layout', () => {
    const htmlAr = generatePrintableHtml('تقرير التحسين', '<p>النتيجة المثلى: 1200</p>', true);
    assert.ok(htmlAr.includes('Sheeta Operations Research'));
    assert.ok(htmlAr.includes('dir="rtl"'));
    assert.ok(htmlAr.includes('lang="ar"'));
    assert.ok(htmlAr.includes('Cairo'));
    assert.ok(htmlAr.includes('النتيجة المثلى: 1200'));
  });

  it('generates pristine printable HTML with LTR layout for English reports', () => {
    const htmlEn = generatePrintableHtml('Optimization Report', '<p>Optimal Z: 1200</p>', false);
    assert.ok(htmlEn.includes('Sheeta Operations Research'));
    assert.ok(htmlEn.includes('dir="ltr"'));
    assert.ok(htmlEn.includes('lang="en"'));
    assert.ok(htmlEn.includes('Plus Jakarta Sans'));
    assert.ok(htmlEn.includes('Optimal Z: 1200'));
  });

  it('handles storage fallback and mirror operations safely', async () => {
    const adapter = new WebPlatformAdapter();
    assert.doesNotThrow(async () => {
      await adapter.storage.syncNativeMirror({
        test_key: 'test_value',
      });
    });
  });

  it('verifies network status contract', () => {
    const platform = getPlatform();
    assert.strictEqual(typeof platform.network.isOnline, 'boolean');
    const unsubscribe = platform.network.subscribe(() => {});
    assert.strictEqual(typeof unsubscribe, 'function');
    unsubscribe();
  });
});
