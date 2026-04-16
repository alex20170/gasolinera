const fs = require('fs');
const https = require('https');
const path = require('path');

const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const TEMPLATE_PATH = path.join(__dirname, '../templates/blog-template.html');
const BLOG_DIR = path.join(__dirname, '../blog');
const SITEMAP_PATH = path.join(__dirname, '../sitemap.xml');

// Fuel mapping same as index.html
const FUEL_MAP = {
    'G95': 'Precio Gasolina 95 E5',
    'G98': 'Precio Gasolina 98 E5',
    'GOA': 'Precio Gasoil A',
    'G+': 'Precio Gasoil Premium',
    'GLP': 'Precio GLP'
};

const HERO_IMAGES = [
    '/assets/blog/hero1.png',
    '/assets/blog/hero2.png',
    '/assets/blog/hero3.png'
];

async function fetchData() {
    return new Promise((resolve, reject) => {
        https.get(API_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

function calculateAverages(stations) {
    const sums = {};
    const counts = {};
    
    stations.forEach(s => {
        Object.entries(FUEL_MAP).forEach(([key, apiFieldName]) => {
            const val = s[apiFieldName];
            if (val) {
                const price = parseFloat(val.replace(',', '.'));
                if (!isNaN(price) && price > 0) {
                    sums[key] = (sums[key] || 0) + price;
                    counts[key] = (counts[key] || 0) + 1;
                }
            }
        });
    });

    const avgs = {};
    Object.keys(sums).forEach(key => {
        avgs[key] = (sums[key] / counts[key]).toFixed(3);
    });
    return avgs;
}

async function run() {
    try {
        console.log('Fetching data...');
        const data = await fetchData();
        const stations = data.ListaEESSPrecio || [];
        const avgs = calculateAverages(stations);
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        const fileDate = now.toISOString().split('T')[0];
        
        const title = `Precios de gasolina en España hoy: ${dateStr}`;
        const description = `Consulta los precios medios de los combustibles en España hoy ${dateStr}. Análisis diario de Gasolina 95, 98 y Diésel.`;
        
        let content = `
            <p>Hoy, <strong>${dateStr}</strong>, los precios de los carburantes en España muestran los siguientes valores medios nacionales. Estos datos son obtenidos directamente del Ministerio de Industria y actualizados en tiempo real.</p>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Gasolina 95</div>
                    <div class="stat-value">${avgs.G95} €/L</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Diésel A</div>
                    <div class="stat-value">${avgs.GOA} €/L</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Gasolina 98</div>
                    <div class="stat-value">${avgs.G98} €/L</div>
                </div>
            </div>

            <h2>Análisis del mercado hoy</h2>
            <p>En el reporte de hoy, vemos que el precio medio de la <strong>Gasolina 95</strong> se sitúa en los <strong>${avgs.G95} €/L</strong>. Por su parte, el <strong>Diésel (Gasoil A)</strong> tiene un coste medio de <strong>${avgs.GOA} €/L</strong>.</p>
            
            <p>Si estás buscando ahorrar, te recomendamos utilizar nuestro buscador en la página principal para encontrar la gasolinera más barata cerca de tu ubicación actual, ya que las diferencias entre provincias y estaciones pueden ser significativas.</p>
            
            <h2>Precios por tipo de combustible</h2>
            <p>A continuación detallamos el resto de carburantes analizados hoy:</p>
            <ul>
                <li><strong>Gasolina 98:</strong> ${avgs.G98} €/L</li>
                <li><strong>Diésel Plus:</strong> ${avgs.Gplus || avgs['G+']} €/L</li>
                <li><strong>GLP:</strong> ${avgs.GLP} €/L</li>
            </ul>
        `;

        // Pick a random hero image (based on date for consistency)
        const imageIndex = now.getDate() % HERO_IMAGES.length;
        const heroImage = HERO_IMAGES[imageIndex];

        let template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
        template = template.replace(/{{TITLE}}/g, title)
                          .replace(/{{DESCRIPTION}}/g, description)
                          .replace(/{{DATE}}/g, dateStr)
                          .replace(/{{HERO_IMAGE}}/g, heroImage)
                          .replace(/{{CONTENT}}/g, content);

        if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR);
        
        const fileName = `${fileDate}-precios-gasolina.html`;
        const filePath = path.join(BLOG_DIR, fileName);
        fs.writeFileSync(filePath, template);
        console.log(`Blog post created: ${fileName}`);

        // Update Sitemap
        updateSitemap(`https://xn--gasolinerasespaa-lub.es/blog/${fileName}`);

        // Update Blog Index
        updateBlogIndex();

        // Update Homepage with latest posts
        updateHomepageBlog();

    } catch (err) {
        console.error('Error details:', err);
    }
}

function updateHomepageBlog() {
    try {
        const indexPath = path.join(__dirname, '../index.html');
        if (!fs.existsSync(indexPath)) return;

        const files = fs.readdirSync(BLOG_DIR)
            .filter(f => f.endsWith('.html') && f !== 'index.html')
            .sort()
            .reverse()
            .slice(0, 3); // Only top 3

        const postsHtml = files.map(f => {
            const date = f.substring(0, 10);
            const d = new Date(date);
            const imgIdx = d.getDate() % HERO_IMAGES.length;
            const thumb = HERO_IMAGES[imgIdx];
            
            return `<a href="/blog/${f}" class="post-card" data-date="${date}" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-xl);padding:var(--space-4);text-decoration:none;color:inherit;transition:all var(--transition-interactive);display:flex;flex-direction:column;gap:var(--space-2)">
                <div style="height:120px;width:100%;background:url('${thumb}') center/cover;border-radius:var(--radius-lg)"></div>
                <span style="font-size:10px;color:var(--color-primary);font-weight:700;text-transform:uppercase">${date}</span>
                <h3 style="font-family:var(--font-display);font-size:var(--text-sm);font-weight:700;line-height:1.2">Precios de hoy: ${date}</h3>
                <p style="font-size:var(--text-xs);color:var(--color-text-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Consulta el reporte diario y ahorra en tu combustible hoy.</p>
            </a>`;
        }).join('\n');

        let indexContent = fs.readFileSync(indexPath, 'utf-8');
        const marker = '<!-- LATEST_BLOG_POSTS -->';
        const regex = new RegExp(`${marker}[\\s\\S]*${marker}`, 'g');
        
        if (indexContent.includes(marker)) {
            indexContent = indexContent.replace(regex, `${marker}\n${postsHtml}\n${marker}`);
            fs.writeFileSync(indexPath, indexContent);
            console.log('Homepage blog section updated');
        }
    } catch (err) {
        console.error('Homepage blog update error:', err);
    }
}

function updateBlogIndex() {
    try {
        const indexPath = path.join(BLOG_DIR, 'index.html');
        if (!fs.existsSync(indexPath)) return;

        const files = fs.readdirSync(BLOG_DIR)
            .filter(f => f.endsWith('.html') && f !== 'index.html')
            .sort()
            .reverse();

        const postListHtml = files.map(f => {
            const date = f.substring(0, 10);
            const d = new Date(date);
            const imgIdx = d.getDate() % HERO_IMAGES.length;
            const thumb = HERO_IMAGES[imgIdx];
            
            return `<a href="${f}" class="post-card" data-date="${date}">
                <div style="height:160px;width:100%;background:url('${thumb}') center/cover;border-radius:var(--radius-lg);margin-bottom:var(--space-2)"></div>
                <span class="post-card-date">${date}</span>
                <h2 class="post-card-title">Precios de hoy: ${date}</h2>
                <p class="post-card-excerpt">Consulta los precios medios de la gasolina y el diésel en España para el día ${date}.</p>
            </a>`;
        }).join('\n');

        let indexContent = fs.readFileSync(indexPath, 'utf-8');
        indexContent = indexContent.replace(/<!-- POSTS_GO_HERE -->[\s\S]*<!-- POSTS_GO_HERE -->|<!-- POSTS_GO_HERE -->/, `<!-- POSTS_GO_HERE -->\n${postListHtml}\n<!-- POSTS_GO_HERE -->`);
        
        fs.writeFileSync(indexPath, indexContent);
        console.log('Blog index updated');
    } catch (err) {
        console.error('Blog index update error:', err);
    }
}

function updateSitemap(newUrl) {
    try {
        if (!fs.existsSync(SITEMAP_PATH)) return;
        let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf-8');
        
        if (sitemap.includes(newUrl)) {
            console.log('URL already in sitemap');
            return;
        }

        const newEntry = `  <url>
    <loc>${newUrl}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>\n</urlset>`;

        sitemap = sitemap.replace('</urlset>', newEntry);
        fs.writeFileSync(SITEMAP_PATH, sitemap);
        console.log('Sitemap updated');
    } catch (err) {
        console.error('Sitemap update error:', err);
    }
}

run();
