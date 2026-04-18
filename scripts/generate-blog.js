const fs = require('fs');
const https = require('https');
const path = require('path');

const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const TEMPLATE_PATH = path.join(__dirname, '../templates/blog-template.html');
const BLOG_DIR = path.join(__dirname, '../blog');
const SITEMAP_PATH = path.join(__dirname, '../sitemap.xml');
const DATA_DIR = path.join(__dirname, '../assets/data');
const PRICES_JSON_PATH = path.join(DATA_DIR, 'prices.json');

// Fuel mapping same as index.html (Corrected API keys)
const FUEL_MAP = {
    'G95': 'Precio Gasolina 95 E5',
    'G98': 'Precio Gasolina 98 E5',
    'GOA': 'Precio Gasoleo A',
    'Gplus': 'Precio Gasoleo Premium',
    'GLP': 'Precio Gases licuados del petróleo'
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
        
        const title = `Precios de gasolina en España el ${dateStr}`;
        const description = `Consulta los precios medios de los combustibles en España el ${dateStr}. Análisis diario de Gasolina 95, 98 y Diésel.`;
        
        let content = `
            <p>El día <strong>${dateStr}</strong>, los precios de los carburantes en España muestran los siguientes valores medios nacionales. Estos datos son obtenidos directamente del Ministerio de Industria.</p>
            
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

            <h2>Análisis del mercado</h2>
            <p>En este reporte, vemos que el precio medio de la <strong>Gasolina 95</strong> se sitúa en los <strong>${avgs.G95} €/L</strong>. Por su parte, el <strong>Diésel (Gasoil A)</strong> tiene un coste medio de <strong>${avgs.GOA} €/L</strong>.</p>
            
            <p>Si estás buscando ahorrar, te recomendamos utilizar nuestro buscador en la página principal para encontrar la gasolinera más barata cerca de tu ubicación actual, ya que las diferencias entre provincias y estaciones pueden ser significativas.</p>
            
            <h2>Precios por tipo de combustible</h2>
            <p>A continuación detallamos el resto de carburantes analizados:</p>
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

        // --- NEW: Save prices.json for static frontend ---
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(PRICES_JSON_PATH, JSON.stringify(data));
        console.log(`Static data saved: assets/data/prices.json`);

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
                .slice(0, 1); // Only top 1 (just today's)
    
            const postsHtml = files.map(f => {
                const date = f.substring(0, 10);
                const d = new Date(date);
                const imgIdx = d.getDate() % HERO_IMAGES.length;
                const thumb = HERO_IMAGES[imgIdx];
                
                return `<a href="/blog/${f}" class="news-card blog-list-card" data-date="${date}">
                    <div class="news-card-badge" id="todayBadge">HOY</div>
                    <div class="news-card-img"><div style="background:url('${thumb}') center/cover"></div></div>
                    <div class="news-card-date" id="blogCardDate">${date}</div>
                    <h3 class="news-card-title" id="blogCardTitle">Precios del día: ${date}</h3>
                    <p class="news-card-excerpt">Consulta el reporte diario y ahorra en tu combustible cada día.</p>
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
    <div class="post-card-img"><div style="background:url('${thumb}') center/cover"></div></div>
    <div class="post-card-body">
        <span class="post-card-date">${date}</span>
        <h2 class="post-card-title">Precios del día: ${date}</h2>
        <p class="post-card-excerpt">Consulta los precios medios de la gasolina y el diésel en España para el día ${date}.</p>
    </div>
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
