(() => {
  'use strict';
  const data = window.CATALOGUE_DATA;
  if (!data || !Array.isArray(data.products)) {
    document.getElementById('catalogue-body').innerHTML = '<tr class="empty-row"><td colspan="5">Catalogue data could not be loaded.</td></tr>';
    return;
  }

  const domainOrder = [
    'Experimental toxicology', 'Exposure science / exposome', 'Regulatory toxicology',
    'Ecotoxicology', 'Toxicogenomics', 'AOP-based mechanistic toxicology',
    'Nanotoxicology', 'Computational and predictive toxicology',
    'Chemical identity and fate', 'Cross-cutting reference data',
  ];
  const indicatorNames = {
    I1: 'Downstream integration', I2: 'Scholarly data reuse', I3: 'Assessment or decision use',
  };
  const typeNames = { curated_dataset: 'Curated dataset', database: 'Database', knowledgebase: 'Knowledgebase' };
  const reuseFeatures = new Map(['structured_data', 'specified_rights', 'traceable_release'].map(code => [code, data.reuse_features.find(row => row.code === code)]));
  const reuseMap = new Map(data.reuse_assessments.map(row => [`${row.resource_id}|${row.feature_code}`, row]));
  const reuseSources = new Map(data.reuse_sources.map(row => [row.source_key, row]));
  const reuseStates = {
    confirmed: { symbol: '✓', label: 'Confirmed', className: 'direct' },
    partial: { symbol: '~', label: 'Partial support', className: 'partial' },
    not_supported: { symbol: '×', label: 'Not supported in assessed scope', className: 'not-supported' },
    unresolved: { symbol: '?', label: 'Unresolved', className: 'unresolved' },
  };
  const stateInfo = {
    direct: { symbol: '✓', label: 'Direct example recorded', note: 'At least one downstream use is recorded as a direct example for this product. The individual evidence record and any mapping caveat appear below. Independent human second review is still pending where no reviewer is named.' },
    partial: { symbol: '~', label: 'Partial evidence only', note: 'The available evidence is indirect, programme-level, refers to a different release, or does not yet establish use of this exact data product.' },
    open: { symbol: '…', label: 'Search incomplete', note: 'A search has started, but no qualifying product-level example is recorded. This does not demonstrate absence of use.' },
    'not-started': { symbol: '?', label: 'Not yet searched', note: 'No indicator-specific search is logged for this product. No conclusion about use can be drawn.' },
    'no-hit': { symbol: '–', label: 'Completed search, no verified hit', note: 'All required routes were searched without a verified example. This is still not proof of non-use.' },
  };
  const summaryMap = new Map(data.summary.map(row => [`${row.resource_id}|${row.indicator}`, row]));
  const evidenceMap = new Map();
  const searchMap = new Map();
  const sourcesMap = new Map();
  for (const row of data.evidence) {
    const key = `${row.resource_id}|${row.indicator}`;
    if (!evidenceMap.has(key)) evidenceMap.set(key, []);
    evidenceMap.get(key).push(row);
  }
  for (const row of data.searches) {
    const key = `${row.resource_id}|${row.indicator}`;
    if (!searchMap.has(key)) searchMap.set(key, []);
    searchMap.get(key).push(row);
  }
  for (const row of data.sources) {
    if (!sourcesMap.has(row.resource_id)) sourcesMap.set(row.resource_id, []);
    sourcesMap.get(row.resource_id).push(row);
  }

  const body = document.getElementById('catalogue-body');
  const searchInput = document.getElementById('product-search');
  const domainFilter = document.getElementById('domain-filter');
  const typeFilter = document.getElementById('type-filter');
  const popover = document.getElementById('evidence-popover');
  const productDialog = document.getElementById('product-dialog');
  let activeButton = null;
  let pinned = false;
  let hoverTimer = null;
  let productTrigger = null;

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function safeUrl(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  }
  function appendLink(parent, text, url) {
    const href = safeUrl(url);
    const node = href ? make('a', '', text) : make('strong', '', text);
    if (href) { node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
    parent.append(node);
    return node;
  }
  function statusFor(resourceId, indicator) {
    const row = summaryMap.get(`${resourceId}|${indicator}`);
    if (row?.direct_examples > 0) return 'direct';
    if (row?.partial_examples > 0) return 'partial';
    if (row?.search_coverage === 'complete') return 'no-hit';
    if (row?.search_coverage === 'partial') return 'open';
    return 'not-started';
  }
  function fillFilters() {
    for (const d of domainOrder) {
      if (!data.products.some(p => (p.primary_subdomain || 'Cross-cutting reference data') === d)) continue;
      const option = make('option', '', d);
      option.value = d;
      domainFilter.append(option);
    }
    for (const [code, label] of Object.entries(typeNames)) {
      if (!data.products.some(p => p.resource_type === code)) continue;
      const option = make('option', '', label);
      option.value = code;
      typeFilter.append(option);
    }
  }
  function updateCounts() {
    document.getElementById('product-count').textContent = data.products.length;
    for (const ind of ['I1', 'I2', 'I3']) {
      document.getElementById(`${ind.toLowerCase()}-count`).textContent = data.products.filter(p => statusFor(p.id, ind) === 'direct').length;
    }
  }

  function renderTable() {
    closePopover();
    const needle = searchInput.value.trim().toLocaleLowerCase();
    const domain = domainFilter.value;
    const type = typeFilter.value;
    const filtered = data.products.filter(p => {
      const pDomain = p.primary_subdomain || 'Cross-cutting reference data';
      const haystack = [p.name, p.acronym, p.parent_programme, p.steward, p.description].filter(Boolean).join(' ').toLocaleLowerCase();
      return (!needle || haystack.includes(needle)) && (!domain || pDomain === domain) && (!type || p.resource_type === type);
    });
    const fragment = document.createDocumentFragment();
    for (const d of domainOrder) {
      const items = filtered.filter(p => (p.primary_subdomain || 'Cross-cutting reference data') === d).sort((a, b) => a.name.localeCompare(b.name));
      if (!items.length) continue;
      const sectionRow = make('tr', 'domain-row');
      const sectionCell = make('th', '', `${d} · ${items.length}`);
      sectionCell.colSpan = 8;
      sectionCell.scope = 'rowgroup';
      sectionRow.append(sectionCell);
      fragment.append(sectionRow);
      for (const product of items) {
        const row = make('tr', 'product-row');
        row.append(make('td', '', typeNames[product.resource_type] || product.resource_type));
        const nameCell = make('td');
        const productButton = make('button', 'product-link', product.name);
        productButton.type = 'button';
        productButton.setAttribute('aria-label', `View product details for ${product.name}`);
        productButton.addEventListener('click', () => openProduct(product, productButton));
        nameCell.append(productButton);
        row.append(nameCell);
        for (const ind of ['I1', 'I2', 'I3', ...reuseFeatures.keys()]) {
          const cell = make('td');
          const isReuse = reuseFeatures.has(ind);
          const state = isReuse ? reuseMap.get(`${product.id}|${ind}`).status : statusFor(product.id, ind);
          const info = isReuse ? reuseStates[state] : stateInfo[state];
          const button = make('button', `impact-button ${isReuse ? info.className : state}`, info.symbol);
          button.type = 'button';
          button.setAttribute('aria-label', `${product.name}, ${reuseFeatures.get(ind)?.label || ind}: ${info.label}. Show evidence.`);
          button.setAttribute('aria-haspopup', 'dialog');
          button.setAttribute('aria-controls', 'evidence-popover');
          button.setAttribute('aria-expanded', 'false');
          button.addEventListener('pointerenter', (event) => {
            if (event.pointerType !== 'touch' && !pinned) openPopover(button, product, ind, false);
          });
          button.addEventListener('pointerleave', () => scheduleClose());
          button.addEventListener('focus', () => { if (!pinned) openPopover(button, product, ind, false); });
          button.addEventListener('click', () => {
            if (activeButton === button && pinned) closePopover();
            else openPopover(button, product, ind, true);
          });
          cell.append(button);
          row.append(cell);
        }
        fragment.append(row);
      }
    }
    if (!filtered.length) {
      const row = make('tr', 'empty-row');
      const cell = make('td', '', 'No products match these filters.');
      cell.colSpan = 8;
      row.append(cell);
      fragment.append(row);
    }
    body.replaceChildren(fragment);
    document.getElementById('shown-count').textContent = `${filtered.length} of ${data.products.length} products shown`;
  }

  function evidenceLabel(decision) {
    if (decision === 'included_direct') return ['direct', 'Direct'];
    if (decision === 'included_partial') return ['partial', 'Partial'];
    return ['other', decision?.replaceAll('_', ' ') || 'Candidate'];
  }
  function renderEvidence(product, indicator) {
    if (reuseFeatures.has(indicator)) return renderReuseEvidence(product, indicator);
    const key = `${product.id}|${indicator}`;
    const state = statusFor(product.id, indicator);
    const summary = summaryMap.get(key);
    document.getElementById('popover-title').replaceChildren(
      make('strong', '', `${indicator} · ${indicatorNames[indicator]}`),
      make('span', '', product.name),
    );
    const content = document.getElementById('popover-content');
    const fragment = document.createDocumentFragment();
    fragment.append(make('p', 'status-note', stateInfo[state].note));
    const meta = make('div', 'micro-meta');
    meta.append(make('span', '', `Search: ${summary?.search_coverage?.replaceAll('_', ' ') || 'not started'}`));
    meta.append(make('span', '', `${summary?.direct_examples || 0} direct · ${summary?.partial_examples || 0} partial`));
    fragment.append(meta);
    const rows = [...(evidenceMap.get(key) || [])].sort((a, b) => {
      const rank = { included_direct: 0, included_partial: 1 };
      return (rank[a.screening_decision] ?? 2) - (rank[b.screening_decision] ?? 2) || a.id - b.id;
    });
    if (!rows.length) fragment.append(make('div', 'no-evidence', 'No evidence assertion is recorded for this product and indicator yet. Open search results should not be interpreted as absence of use.'));
    else {
      const list = make('div', 'evidence-list');
      for (const row of rows) {
        const [kind, label] = evidenceLabel(row.screening_decision);
        const card = make('article', `evidence-card ${kind}`);
        const heading = make('div', 'evidence-head');
        appendLink(heading, row.target_name, row.target_url);
        heading.append(make('span', 'evidence-label', label));
        card.append(heading);
        if (row.evidence_paraphrase) card.append(make('p', '', row.evidence_paraphrase));
        const details = [row.section_or_page && `Location: ${row.section_or_page}`, row.source_version && `Source version: ${row.source_version}`, row.checked_on && `Checked: ${row.checked_on}`].filter(Boolean).join(' · ');
        if (details) card.append(make('p', 'evidence-meta', details));
        if (row.adjudication_note) card.append(make('p', 'caveat', row.adjudication_note));
        if (row.screening_decision === 'included_direct' && !row.second_reviewer) card.append(make('p', 'evidence-meta', 'Human second review pending'));
        list.append(card);
      }
      fragment.append(list);
    }
    const runs = searchMap.get(key) || [];
    if (runs.length) {
      const details = make('details', 'search-details');
      details.append(make('summary', '', `${runs.length} logged search${runs.length === 1 ? '' : 'es'} · show latest routes`));
      const ul = make('ul');
      for (const run of runs.slice(-3).reverse()) {
        const text = `${run.search_date || 'Undated'} · ${run.route || run.engine}: ${run.notes || run.query || 'No note'}`;
        ul.append(make('li', '', text));
      }
      details.append(ul);
      fragment.append(details);
    }
    content.replaceChildren(fragment);
  }
  function renderReuseEvidence(product, code) {
    const feature = reuseFeatures.get(code);
    const assessment = reuseMap.get(`${product.id}|${code}`);
    document.getElementById('popover-title').replaceChildren(
      make('strong', '', feature.label), make('span', '', product.name),
    );
    const content = document.getElementById('popover-content');
    const fragment = document.createDocumentFragment();
    fragment.append(make('p', 'status-note', reuseStates[assessment.status].label));
    fragment.append(make('p', '', feature.definition));
    const grid = make('dl', 'detail-grid');
    detailItem(grid, 'Assessed scope', assessment.scope);
    detailItem(grid, 'Basis', assessment.basis);
    detailItem(grid, 'Rights category', assessment.rights_category?.replaceAll('_', ' '));
    detailItem(grid, 'Assessed release', assessment.release_label);
    detailItem(grid, 'Checked', assessment.checked_on);
    fragment.append(grid);
    const links = data.reuse_links.filter(row => row.resource_id === product.id && row.feature_code === code);
    for (const link of links) {
      const source = reuseSources.get(link.source_key);
      const card = make('article', 'evidence-card');
      appendLink(card, source.title, source.url);
      card.append(make('p', 'evidence-meta', `${link.role.replaceAll('_', ' ')} · ${source.source_location} · ${source.checked_on} · ${source.access_state.replaceAll('_', ' ')}`));
      card.append(make('p', '', source.evidence_summary));
      fragment.append(card);
    }
    fragment.append(make('p', 'caveat', 'Provider documentation and metadata review; no dataset payload or API-query testing. ' + (assessment.second_reviewer ? `Second reviewer: ${assessment.second_reviewer}` : 'Independent human second review pending.')));
    content.replaceChildren(fragment);
  }
  function positionPopover(button) {
    const rect = button.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
    const below = window.innerHeight - rect.bottom;
    const top = below >= Math.min(height, 420) + 12 ? rect.bottom + 9 : Math.max(12, rect.top - height - 9);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
  function openPopover(button, product, indicator, pin) {
    clearTimeout(hoverTimer);
    if (activeButton && activeButton !== button) activeButton.setAttribute('aria-expanded', 'false');
    activeButton = button;
    pinned = pin;
    renderEvidence(product, indicator);
    popover.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionPopover(button);
  }
  function closePopover() {
    clearTimeout(hoverTimer);
    if (activeButton) activeButton.setAttribute('aria-expanded', 'false');
    activeButton = null;
    pinned = false;
    popover.hidden = true;
  }
  function scheduleClose() {
    if (pinned) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => { if (!popover.matches(':hover')) closePopover(); }, 220);
  }

  function detailItem(grid, label, value) {
    if (value == null || value === '') return;
    const wrapper = make('div');
    wrapper.append(make('dt', '', label), make('dd', '', value));
    grid.append(wrapper);
  }
  function openProduct(product, trigger) {
    closePopover();
    productTrigger = trigger;
    const container = document.getElementById('product-content');
    const fragment = document.createDocumentFragment();
    fragment.append(make('div', 'detail-kicker', typeNames[product.resource_type] || product.resource_type));
    fragment.append(make('h2', '', product.name));
    if (product.description) fragment.append(make('p', '', product.description));
    const grid = make('dl', 'detail-grid');
    detailItem(grid, 'Primary domain', product.primary_subdomain || 'Cross-cutting reference data');
    detailItem(grid, 'Evidence layer', product.evidence_layers);
    detailItem(grid, 'Data level', product.primary_data_level);
    detailItem(grid, 'Steward', product.steward);
    detailItem(grid, 'Country', product.steward_country);
    detailItem(grid, 'Parent programme', product.parent_programme);
    detailItem(grid, 'Access', product.access_routes);
    detailItem(grid, 'Documented formats', product.data_formats);
    detailItem(grid, 'Version', product.version);
    fragment.append(grid);
    const reuseSection = make('section', 'detail-section');
    reuseSection.append(make('h3', '', 'Conditions for reuse · source-based review'));
    for (const [code, feature] of reuseFeatures) {
      const assessment = reuseMap.get(`${product.id}|${code}`);
      reuseSection.append(make('p', '', `${feature.label}: ${reuseStates[assessment.status].label}. ${assessment.basis}`));
    }
    fragment.append(reuseSection);
    const sources = sourcesMap.get(product.id) || [];
    const section = make('section', 'detail-section');
    section.append(make('h3', '', `Product sources (${sources.length})`));
    const ul = make('ul');
    for (const source of sources) {
      const li = make('li');
      appendLink(li, source.source_title || source.url, source.url);
      if (source.supports) li.append(document.createTextNode(` — ${source.supports}`));
      ul.append(li);
    }
    if (!sources.length) ul.append(make('li', '', 'No product-level source recorded.'));
    section.append(ul);
    fragment.append(section);
    container.replaceChildren(fragment);
    productDialog.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('close-product').focus();
  }
  function closeProduct() {
    productDialog.hidden = true;
    document.body.style.overflow = '';
    productTrigger?.focus();
    productTrigger = null;
  }

  fillFilters();
  updateCounts();
  renderTable();
  searchInput.addEventListener('input', renderTable);
  domainFilter.addEventListener('change', renderTable);
  typeFilter.addEventListener('change', renderTable);
  document.getElementById('close-popover').addEventListener('click', closePopover);
  popover.addEventListener('pointerenter', () => clearTimeout(hoverTimer));
  popover.addEventListener('pointerleave', scheduleClose);
  document.getElementById('close-product').addEventListener('click', closeProduct);
  productDialog.querySelector('[data-close-product]').addEventListener('click', closeProduct);
  document.addEventListener('pointerdown', event => {
    if (!popover.hidden && !popover.contains(event.target) && !event.target.closest('.impact-button')) closePopover();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!productDialog.hidden) closeProduct();
      else closePopover();
    }
  });
  document.getElementById('table-scroll').addEventListener('scroll', closePopover, { passive: true });
  window.addEventListener('resize', closePopover, { passive: true });
})();
