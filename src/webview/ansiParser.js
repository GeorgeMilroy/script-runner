// ansiParser.js — Lightweight ANSI SGR to HTML converter
// Handles colors and text styling. Strips non-SGR escape sequences.
(function () {
  'use strict';

  const SGR_CLASSES = {
    1: 'ansi-bold',
    2: 'ansi-dim',
    3: 'ansi-italic',
    4: 'ansi-underline',
    30: 'ansi-black',
    31: 'ansi-red',
    32: 'ansi-green',
    33: 'ansi-yellow',
    34: 'ansi-blue',
    35: 'ansi-magenta',
    36: 'ansi-cyan',
    37: 'ansi-white',
    90: 'ansi-bright-black',
    91: 'ansi-bright-red',
    92: 'ansi-bright-green',
    93: 'ansi-bright-yellow',
    94: 'ansi-bright-blue',
    95: 'ansi-bright-magenta',
    96: 'ansi-bright-cyan',
    97: 'ansi-bright-white',
  };

  /**
   * Convert ANSI escape codes to styled HTML spans.
   * HTML-escapes text first to prevent XSS.
   * @param {string} text
   * @returns {string}
   */
  window.parseAnsi = function (text) {
    // HTML-escape first
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    let result = '';
    const currentClasses = new Set();
    const ansiRegex = /\x1b\[([0-9;]*)m/g;
    let lastIndex = 0;
    let match;

    while ((match = ansiRegex.exec(escaped)) !== null) {
      // Text before this escape
      if (match.index > lastIndex) {
        const chunk = escaped.substring(lastIndex, match.index);
        if (currentClasses.size > 0) {
          result += '<span class="' + [...currentClasses].join(' ') + '">' + chunk + '</span>';
        } else {
          result += chunk;
        }
      }

      // Parse SGR params
      const params = match[1].split(';').map(Number);
      for (const code of params) {
        if (code === 0 || isNaN(code)) {
          currentClasses.clear();
        } else if (SGR_CLASSES[code]) {
          currentClasses.add(SGR_CLASSES[code]);
        }
      }

      lastIndex = ansiRegex.lastIndex;
    }

    // Remaining text
    if (lastIndex < escaped.length) {
      const remaining = escaped.substring(lastIndex);
      if (currentClasses.size > 0) {
        result += '<span class="' + [...currentClasses].join(' ') + '">' + remaining + '</span>';
      } else {
        result += remaining;
      }
    }

    // Strip non-SGR ANSI sequences
    result = result.replace(/\x1b\[[0-9;]*[A-HJ-Za-z]/g, '');

    // Linkify URLs (http/https) — runs after HTML escaping so & is &amp;
    result = result.replace(
      /https?:\/\/[^\s&lt;"')\]]+/g,
      function (url) {
        var href = url.replace(/&amp;/g, '&');
        return '<a class="output-link" href="#" data-href="' + href + '" title="Ctrl+Click to open">' + url + '</a>';
      }
    );

    return result;
  };
})();
