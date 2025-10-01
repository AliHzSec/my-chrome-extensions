"use strict";
(() => {
  window.__jsonFormatterStartTime = performance.now();

  const getValueType = (value) => {
    if (typeof value === "string") return "string";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return "object";
  };

  const createElement = (tag = "span", className = "", text = "") => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };

  const templates = {
    entry: () => createElement("span", "jf-entry"),
    expander: () => createElement("span", "jf-expander"),
    key: () => createElement("span", "jf-key"),
    string: () => createElement("span", "jf-string"),
    number: () => createElement("span", "jf-number"),
    boolean: () => createElement("span", "jf-boolean"),
    null: () => createElement("span", "jf-null", "null"),
    brace: (char) => createElement("span", "jf-brace", char),
    bracket: (char) => createElement("span", "jf-bracket", char),
    comma: () => document.createTextNode(","),
    colon: () => createElement("span", "jf-colon", ": "),
    quote: () => createElement("span", "jf-quote", '"'),
    ellipsis: () => createElement("span", "jf-ellipsis"),
    blockInner: () => createElement("span", "jf-block-inner"),
  };

  const parseQuery = (query) => {
    if (!query || query === '.') return [];
    query = query.replace(/^\./, '');
    const parts = [];
    let current = '';
    let inBracket = false;

    for (let i = 0; i < query.length; i++) {
      const char = query[i];
      if (char === '[') {
        if (current) parts.push(current);
        current = '';
        inBracket = true;
      } else if (char === ']') {
        if (inBracket) {
          parts.push(current === '' ? '[]' : parseInt(current));
        }
        current = '';
        inBracket = false;
      } else if (char === '.' && !inBracket) {
        if (current) parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    if (current) parts.push(current);
    return parts;
  };

  const executeQuery = (data, query) => {
    try {
      const parts = parseQuery(query);
      if (parts.length === 0) return { success: true, result: data };

      let results = [data];
      for (const part of parts) {
        let newResults = [];
        for (const current of results) {
          if (current === null || current === undefined) {
            return { success: false, error: 'Cannot access property of null/undefined' };
          }
          if (part === '[]') {
            if (!Array.isArray(current)) {
              return { success: false, error: `Expected array for [] but got ${typeof current}` };
            }
            newResults.push(...current);
          } else if (typeof part === 'number') {
            if (!Array.isArray(current)) {
              return { success: false, error: `Expected array but got ${typeof current}` };
            }
            if (part < 0 || part >= current.length) {
              return { success: false, error: `Array index ${part} out of bounds` };
            }
            newResults.push(current[part]);
          } else {
            if (typeof current !== 'object' || Array.isArray(current)) {
              return { success: false, error: `Expected object but got ${Array.isArray(current) ? 'array' : typeof current}` };
            }
            if (!(part in current)) {
              return { success: false, error: `Property "${part}" not found` };
            }
            newResults.push(current[part]);
          }
        }
        results = newResults;
      }
      return { success: true, result: results.length === 1 ? results[0] : results };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const buildJsonTree = (value, key = null) => {
    const type = getValueType(value);
    const entry = templates.entry();
    let hasChildren = false;
    let childCount = 0;

    if (type === "object" || type === "array") {
      childCount = type === "object" ? Object.keys(value).length : value.length;
      hasChildren = childCount > 0;
      if (hasChildren) entry.appendChild(templates.expander());
    }

    if (key !== null) {
      entry.classList.add("jf-property");
      const keySpan = templates.key();
      keySpan.textContent = key;
      entry.appendChild(templates.quote());
      entry.appendChild(keySpan);
      entry.appendChild(templates.quote());
      entry.appendChild(templates.colon());
    } else {
      entry.classList.add("jf-array-item");
    }

    switch (type) {
      case "string": {
        const stringSpan = templates.string();
        const escaped = JSON.stringify(value).slice(1, -1);
        if (value.match(/^https?:\/\//)) {
          const link = document.createElement("a");
          link.href = value;
          link.textContent = escaped;
          link.target = "_blank";
          stringSpan.appendChild(link);
        } else {
          stringSpan.textContent = escaped;
        }
        entry.appendChild(templates.quote());
        entry.appendChild(stringSpan);
        entry.appendChild(templates.quote());
        break;
      }
      case "number": {
        entry.appendChild(templates.number()).textContent = String(value);
        break;
      }
      case "boolean": {
        entry.appendChild(templates.boolean()).textContent = String(value);
        break;
      }
      case "null": {
        entry.appendChild(templates.null());
        break;
      }
      case "object": {
        entry.appendChild(templates.brace("{"));
        if (hasChildren) {
          entry.appendChild(templates.ellipsis());
          const block = templates.blockInner();
          Object.entries(value).forEach(([k, v], idx, arr) => {
            const child = buildJsonTree(v, k);
            if (idx < arr.length - 1) child.appendChild(templates.comma());
            block.appendChild(child);
          });
          entry.appendChild(block);
        }
        entry.appendChild(templates.brace("}"));
        entry.dataset.count = childCount;
        entry.dataset.label = childCount === 1 ? "property" : "properties";
        break;
      }
      case "array": {
        entry.appendChild(templates.bracket("["));
        if (hasChildren) {
          entry.appendChild(templates.ellipsis());
          const block = templates.blockInner();
          value.forEach((item, idx) => {
            const child = buildJsonTree(item, null);
            if (idx < value.length - 1) child.appendChild(templates.comma());
            block.appendChild(child);
          });
          entry.appendChild(block);
        }
        entry.appendChild(templates.bracket("]"));
        entry.dataset.count = childCount;
        entry.dataset.label = childCount === 1 ? "item" : "items";
        break;
      }
    }
    return entry;
  };

  const initJsonFormatter = async () => {
    const preElement = document.querySelector("body > pre");
    if (!preElement) return { formatted: false, note: "No body>pre found" };

    const rawText = preElement.textContent;
    if (!rawText) return { formatted: false, note: "No content in body>pre" };

    const length = rawText.length;
    if (length > 3000000) return { formatted: false, note: "Too long", rawLength: length };
    if (!/^\s*[\{\[]/.test(rawText)) return { formatted: false, note: "Does not start with { or [" };

    let jsonData;
    try {
      jsonData = JSON.parse(rawText);
    } catch {
      return { formatted: false, note: "Invalid JSON" };
    }

    if (typeof jsonData !== "object" && !Array.isArray(jsonData)) {
      return { formatted: false, note: "Not an object or array" };
    }

    preElement.remove();

    document.body.classList.add('jf-formatted');

    // Inject CSS
    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = chrome.runtime.getURL("content.css");
    document.head.appendChild(cssLink);

    // Create toolbar
    const toolbar = createElement("div");
    toolbar.id = "jf-toolbar";

    const queryContainer = createElement("div", "jf-query-container");
    const queryInputWrapper = createElement("div", "jf-query-input-wrapper");
    const queryInput = createElement("input", "jf-query-input");
    queryInput.type = "text";
    queryInput.placeholder = "Query: .[].name or .users[0].email";

    const queryHint = createElement("span", "jf-query-hint", "Press Enter");
    queryInputWrapper.appendChild(queryInput);
    queryInputWrapper.appendChild(queryHint);

    const rawCheckboxLabel = createElement("label", "jf-raw-checkbox");
    const rawCheckbox = createElement("input");
    rawCheckbox.type = "checkbox";
    rawCheckboxLabel.appendChild(rawCheckbox);
    rawCheckboxLabel.appendChild(createElement("span", "", "Raw (-r)"));

    queryContainer.appendChild(queryInputWrapper);
    queryContainer.appendChild(rawCheckboxLabel);
    toolbar.appendChild(queryContainer);

    const copyBtn = createElement("button", "jf-copy-btn", "Copy");
    toolbar.appendChild(copyBtn);

    const btnGroup = createElement("div", "jf-btn-group");
    const btnParsed = createElement("button", "jf-btn jf-btn-active", "Parsed");
    const btnRaw = createElement("button", "jf-btn", "Raw");
    btnGroup.appendChild(btnParsed);
    btnGroup.appendChild(btnRaw);
    toolbar.appendChild(btnGroup);

    document.body.appendChild(toolbar);

    const parsedContainer = createElement("div");
    parsedContainer.id = "jf-parsed";
    document.body.appendChild(parsedContainer);

    const rawContainer = createElement("div");
    rawContainer.id = "jf-raw";
    rawContainer.hidden = true;
    const rawPre = createElement("pre", "", rawText);
    rawContainer.appendChild(rawPre);
    document.body.appendChild(rawContainer);

    let currentData = jsonData;
    let originalData = jsonData;
    let isRawOutput = false;
    let isRawView = false;

    const renderParsedData = (data) => {
      parsedContainer.innerHTML = '';
      if (isRawOutput) {
        parsedContainer.classList.add('jf-raw-output');
        let output = '';
        if (Array.isArray(data)) {
          output = data.map(item => {
            if (typeof item === 'string') return item;
            if (typeof item === 'number' || typeof item === 'boolean') return String(item);
            if (item === null) return 'null';
            return JSON.stringify(item);
          }).join('\n');
        } else if (typeof data === 'string') {
          output = data;
        } else if (typeof data === 'number' || typeof data === 'boolean') {
          output = String(data);
        } else if (data === null) {
          output = 'null';
        } else {
          output = JSON.stringify(data, null, 2);
        }
        parsedContainer.textContent = output;
      } else {
        parsedContainer.classList.remove('jf-raw-output');
        parsedContainer.appendChild(buildJsonTree(data, null));
      }
    };

    renderParsedData(currentData);

    copyBtn.addEventListener('click', async () => {
      try {
        let textToCopy = '';
        if (isRawView) {
          textToCopy = rawPre.textContent;
        } else if (isRawOutput) {
          textToCopy = parsedContainer.textContent;
        } else {
          textToCopy = typeof currentData === 'object'
            ? JSON.stringify(currentData, null, 2)
            : String(currentData);
        }

        // Try modern Clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          // Fallback to old method
          const textarea = document.createElement('textarea');
          textarea.value = textToCopy;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }

        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('jf-copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('jf-copied');
        }, 2000);
      } catch (err) {
        console.error('Copy failed:', err);
        copyBtn.textContent = 'Failed';
        setTimeout(() => copyBtn.textContent = 'Copy', 2000);
      }
    });

    rawCheckbox.addEventListener('change', () => {
      isRawOutput = rawCheckbox.checked;
      renderParsedData(currentData);
    });

    let errorTimeout = null;
    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = queryInput.value.trim();
        queryInput.classList.remove('jf-query-error');
        const existingError = queryContainer.querySelector('.jf-query-error-msg');
        if (existingError) existingError.remove();
        if (errorTimeout) clearTimeout(errorTimeout);

        if (!query || query === '.') {
          currentData = originalData;
          renderParsedData(currentData);
          return;
        }

        const result = executeQuery(originalData, query);
        if (result.success) {
          currentData = result.result;
          renderParsedData(currentData);
        } else {
          queryInput.classList.add('jf-query-error');
          const errorMsg = createElement('div', 'jf-query-error-msg', result.error);
          queryContainer.style.position = 'relative';
          queryContainer.appendChild(errorMsg);
          errorTimeout = setTimeout(() => {
            queryInput.classList.remove('jf-query-error');
            errorMsg.remove();
          }, 3000);
        }
      }
    });

    btnRaw.addEventListener("click", () => {
      if (!isRawView) {
        isRawView = true;
        parsedContainer.hidden = true;
        rawContainer.hidden = false;
        btnParsed.classList.remove("jf-btn-active");
        btnRaw.classList.add("jf-btn-active");
        queryInput.disabled = true;
        rawCheckbox.disabled = true;
      }
    });

    btnParsed.addEventListener("click", () => {
      if (isRawView) {
        isRawView = false;
        parsedContainer.hidden = false;
        rawContainer.hidden = true;
        btnRaw.classList.remove("jf-btn-active");
        btnParsed.classList.add("jf-btn-active");
        queryInput.disabled = false;
        rawCheckbox.disabled = false;
      }
    });

    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("jf-expander")) {
        e.preventDefault();
        const entry = e.target.parentElement;
        if (e.metaKey || e.ctrlKey) {
          const parent = entry.parentElement;
          const shouldCollapse = !entry.classList.contains("jf-collapsed");
          Array.from(parent.children).forEach(child => {
            if (child.classList.contains("jf-entry")) {
              child.classList.toggle("jf-collapsed", shouldCollapse);
            }
          });
        } else {
          entry.classList.toggle("jf-collapsed");
        }
      }
    });

    return { formatted: true, note: "Success", rawLength: length };
  };

  initJsonFormatter().then(result => {
    if (result.formatted) {
      console.log("✨ JSON Beautifier: Formatted successfully");
      console.log(`📊 Size: ${result.rawLength} characters`);
    }
  });
})();