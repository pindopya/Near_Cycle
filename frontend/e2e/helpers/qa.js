import { expect } from '@playwright/test';

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
].join(',');

export function watchPageDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('requestfailed', (request) => {
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText || 'request failed',
    });
  });

  return { consoleErrors, pageErrors, failedRequests };
}

export async function expectNoHorizontalOverflow(page, tolerance = 2) {
  const metrics = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body?.scrollWidth || 0,
    innerWidth: window.innerWidth,
  }));

  const widest = Math.max(metrics.documentScrollWidth, metrics.bodyScrollWidth);
  expect(
    widest - metrics.documentClientWidth,
    `horizontal overflow detected: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(tolerance);
}

export async function expectInteractiveCentersUnobscured(page) {
  const issues = await page.evaluate((selector) => {
    const visibleModal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .find((dialog) => {
        if (!(dialog instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(dialog);
        const rect = dialog.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      });

    const root = visibleModal || document;
    const elements = [...root.querySelectorAll(selector)];
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const problems = [];

    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.hidden || element.getAttribute('aria-hidden') === 'true') continue;
      if ('disabled' in element && element.disabled) continue;

      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;

      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.left < 0 || rect.top < 0 || rect.right > viewport.width || rect.bottom > viewport.height) continue;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const top = document.elementFromPoint(centerX, centerY);
      if (!top) continue;
      if (top === element || element.contains(top) || top.contains(element)) continue;

      const targetMarkerPane = element.closest('.leaflet-marker-pane');
      const blockerMarkerPane = top.closest?.('.leaflet-marker-pane');
      if (targetMarkerPane && blockerMarkerPane && targetMarkerPane === blockerMarkerPane) continue;

      const blockerStyle = top instanceof HTMLElement ? window.getComputedStyle(top) : null;
      let blockerNode = top;
      let blockedBySticky = false;
      while (blockerNode instanceof HTMLElement) {
        if (window.getComputedStyle(blockerNode).position === 'sticky') {
          blockedBySticky = true;
          break;
        }
        blockerNode = blockerNode.parentElement;
      }
      if (blockedBySticky) continue;
      problems.push({
        target: element.getAttribute('aria-label')
          || element.textContent?.trim().replace(/\s+/g, ' ')
          || element.getAttribute('name')
          || element.id
          || element.tagName.toLowerCase(),
        blocker: top.getAttribute?.('aria-label')
          || top.textContent?.trim().replace(/\s+/g, ' ')
          || top.id
          || String(top.className || '')
          || top.tagName.toLowerCase(),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    return problems;
  }, INTERACTIVE_SELECTOR);

  expect(issues, `interactive controls blocked at their center: ${JSON.stringify(issues, null, 2)}`).toEqual([]);
}

export async function expectNoUnexpectedHorizontalClipping(page, tolerance = 2) {
  const issues = await page.evaluate(({ selector, tolerance: allowed }) => {
    const visibleModal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .find((dialog) => {
        if (!(dialog instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(dialog);
        const rect = dialog.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      });

    const root = visibleModal || document;
    const viewportWidth = window.innerWidth;
    const problems = [];

    function hasHorizontalScrollContainer(element) {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const scrollable = ['auto', 'scroll'].includes(style.overflowX)
          && current.scrollWidth > current.clientWidth + allowed;
        if (scrollable) return true;
        current = current.parentElement;
      }
      return false;
    }

    for (const element of root.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.hidden || element.getAttribute('aria-hidden') === 'true') continue;

      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      if (hasHorizontalScrollContainer(element)) continue;

      if (rect.left < -allowed || rect.right > viewportWidth + allowed) {
        problems.push({
          target: element.getAttribute('aria-label')
            || element.textContent?.trim().replace(/\s+/g, ' ')
            || element.getAttribute('name')
            || element.id
            || element.tagName.toLowerCase(),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          viewportWidth,
        });
      }
    }

    return problems;
  }, { selector: INTERACTIVE_SELECTOR, tolerance });

  expect(
    issues,
    `interactive controls clipped horizontally: ${JSON.stringify(issues, null, 2)}`,
  ).toEqual([]);
}

export async function visibleInteractiveInventory(page) {
  return page.locator(INTERACTIVE_SELECTOR).evaluateAll((elements) => elements
    .filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    })
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      label: element.getAttribute('aria-label')
        || element.textContent?.trim().replace(/\s+/g, ' ')
        || element.getAttribute('name')
        || element.id
        || element.tagName.toLowerCase(),
      href: element instanceof HTMLAnchorElement ? element.getAttribute('href') : null,
      disabled: 'disabled' in element ? Boolean(element.disabled) : false,
    })));
}

export async function expectDiagnosticsClean(diagnostics, {
  allowConsole = [],
  allowFailedRequest = [],
} = {}) {
  const unexpectedConsole = diagnostics.consoleErrors.filter(
    (message) => !allowConsole.some((pattern) => pattern.test(message)),
  );
  const unexpectedRequests = diagnostics.failedRequests.filter(
    (entry) => !allowFailedRequest.some((pattern) => pattern.test(entry.url)),
  );

  expect(unexpectedConsole, 'unexpected console.error messages').toEqual([]);
  expect(diagnostics.pageErrors, 'uncaught page errors').toEqual([]);
  expect(unexpectedRequests, 'unexpected failed network requests').toEqual([]);
}
