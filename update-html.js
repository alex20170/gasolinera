const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory && !dirPath.includes('.git')) walkDir(dirPath, callback);
    else if (f.endsWith('.html')) callback(dirPath);
  });
}

const telegramRegex = /<a href=\"https:\/\/t\.me\/gasolineras_esp\" target=\"_blank\" class=\"dock-item\" data-label=\"Telegram\">\s*<i data-lucide=\"send\" width=\"20\" height=\"20\"><\/i>\s*<\/a>/g;
const replacement = `<a href="mailto:contacto@gasolinerasespaña.es" class="dock-item" data-label="Contacto">\n    <i data-lucide="mail" width="20" height="20"></i>\n  </a>`;

walkDir('.', (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Replace Telegram with Mail
  if (telegramRegex.test(content)) {
    content = content.replace(telegramRegex, replacement);
    changed = true;
  }

  // Fix Dark Mode in Blog
  if (filePath.includes('blog') || filePath.includes('template')) {
    const goodDarkMode = `[data-theme="dark"]{
  --color-bg:#171614;--color-surface:#1c1b19;--color-surface-2:#201f1d;
  --color-surface-offset:#1d1c1a;--color-surface-dynamic:#2d2c2a;
  --color-divider:#262523;--color-border:#393836;
  --color-text:#cdccca;--color-text-muted:#797876;--color-text-faint:#5a5957;--color-text-inverse:#2b2a28;
  --color-primary:#4f98a3;--color-primary-hover:#227f8b;--color-primary-active:#1a626b;--color-primary-highlight:#313b3b;
  --color-success:#6daa45;--color-success-highlight:#3a4435;
  --color-warning:#bb653b;--color-warning-highlight:#564942;
  --color-error:#d163a7;--color-error-highlight:#4c3d46;
  --color-orange:#fdab43;--color-gold:#e8af34;--color-blue:#5591c7;
  --shadow-sm:0 1px 2px oklch(0 0 0/.2);--shadow-md:0 4px 12px oklch(0 0 0/.3);--shadow-lg:0 12px 32px oklch(0 0 0/.4);
}`;
    if (content.includes('--color-text-inverse:#2b2a28;') && !content.includes('--color-primary:#4f98a3;')) {
        content = content.replace(/\[data-theme="dark"\]\{[\s\S]*?--color-text-inverse:#2b2a28;\s*\}/, goodDarkMode);
        changed = true;
    }
    
    // Add onclick to calendar icon
    const calendarIconHtml = /<div class="search-label">\s*<i data-lucide="calendar" width="18" height="18"><\/i>\s*<span>Buscar fecha<\/span>\s*<\/div>/g;
    const calendarIconReplacement = `<div class="search-label" onclick="document.getElementById('dateFilter').showPicker()" style="cursor:pointer">\n        <i data-lucide="calendar" width="18" height="18"></i>\n        <span>Buscar fecha</span>\n      </div>`;
    
    if (calendarIconHtml.test(content)) {
      content = content.replace(calendarIconHtml, calendarIconReplacement);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', filePath);
  }
});
