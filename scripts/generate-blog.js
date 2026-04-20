const fs = require('fs');
const https = require('https');
const path = require('path');

const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const TEMPLATE_PATH = path.join(__dirname, '../templates/blog-template.html');
const BLOG_DIR = path.join(__dirname, '../blog');
const SITEMAP_PATH = path.join(__dirname, '../sitemap.xml');
const DATA_DIR = path.join(__dirname, '../assets/data');
const PRICES_JSON_PATH = path.join(DATA_DIR, 'prices.json');

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

function analyzeData(stations) {
    const sums = {};
    const counts = {};
    const provinces = {};
    const brands = {};
    const cheapestStations = {};

    stations.forEach(s => {
        const provinceName = s['Provincia'];
        const brandName = s['Rótulo'] || 'Independiente';

        if (!provinces[provinceName]) provinces[provinceName] = { sums: {}, counts: {} };
        if (!brands[brandName]) brands[brandName] = { sums: {}, counts: {} };

        Object.entries(FUEL_MAP).forEach(([key, apiFieldName]) => {
            const val = s[apiFieldName];
            if (val) {
                const price = parseFloat(val.replace(',', '.'));
                if (!isNaN(price) && price > 0.1) {
                    // National
                    sums[key] = (sums[key] || 0) + price;
                    counts[key] = (counts[key] || 0) + 1;

                    // Province
                    provinces[provinceName].sums[key] = (provinces[provinceName].sums[key] || 0) + price;
                    provinces[provinceName].counts[key] = (provinces[provinceName].counts[key] || 0) + 1;

                    // Brands
                    brands[brandName].sums[key] = (brands[brandName].sums[key] || 0) + price;
                    brands[brandName].counts[key] = (brands[brandName].counts[key] || 0) + 1;

                    // Cheapest
                    if (!cheapestStations[key] || price < cheapestStations[key].price) {
                        cheapestStations[key] = {
                            price: price,
                            name: s['Rótulo'],
                            address: s['Dirección'],
                            locality: s['Municipio'],
                            province: provinceName
                        };
                    }
                }
            }
        });
    });

    const nationalAvgs = {};
    Object.keys(sums).forEach(key => nationalAvgs[key] = (sums[key] / counts[key]).toFixed(3));

    const provinceAvgs = Object.entries(provinces).map(([name, data]) => {
        const avgs = {};
        Object.keys(data.sums).forEach(k => avgs[k] = (data.sums[k] / data.counts[k]));
        return { name, avgs };
    });

    const brandAvgs = Object.entries(brands).map(([name, data]) => {
        const avgs = {};
        Object.keys(data.sums).forEach(k => avgs[k] = (data.sums[k] / data.counts[k]));
        return { name, avgs };
    }).filter(b => Object.keys(b.avgs).length > 0);

    return { nationalAvgs, provinceAvgs, brandAvgs, cheapestStations };
}

async function run() {
    try {
        console.log('Fetching data...');
        const data = await fetchData();
        const stations = data.ListaEESSPrecio || [];
        const analysis = analyzeData(stations);
        const { nationalAvgs, provinceAvgs, brandAvgs, cheapestStations } = analysis;
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        const fileDate = now.toISOString().split('T')[0];
        
        const title = `Análisis de precios de gasolina en España: Informe del ${dateStr}`;
        const description = `Informe profesional sobre los precios de combustibles en España el ${dateStr}. Análisis por provincias, marcas y las gasolineras más baratas.`;
        
        // Sorting for reports
        const topProvinces95 = [...provinceAvgs].filter(p => p.avgs.G95).sort((a,b) => a.avgs.G95 - b.avgs.G95).slice(0, 5);
        const topBrands95 = [...brandAvgs].filter(b => b.avgs.G95).sort((a,b) => a.avgs.G95 - b.avgs.G95).slice(0, 5);

        let content = `
            <p class="lead">Hoy, <strong>${dateStr}</strong>, presentamos un análisis detallado del mercado de carburantes en España. Basado en los datos oficiales del Ministerio de Industria, evaluamos las tendencias y localizamos las mejores oportunidades de ahorro para los consumidores.</p>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Media Gasolina 95</div>
                    <div class="stat-value">${nationalAvgs.G95} €/L</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Media Diésel A</div>
                    <div class="stat-value">${nationalAvgs.GOA} €/L</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Media Gasolina 98</div>
                    <div class="stat-value">${nationalAvgs.G98} €/L</div>
                </div>
            </div>

            <h2>Resumen del día</h2>
            <p>El mercado nacional muestra una estabilidad relativa. La <strong>Gasolina 95</strong> se mantiene con un promedio de <strong>${nationalAvgs.G95} €/L</strong>, mientras que el <strong>Gasoil A</strong> registra <strong>${nationalAvgs.GOA} €/L</strong>. Observamos una brecha significativa de hasta 0.40€ entre las estaciones más económicas y las más costosas, lo que subraya la importancia de comparar antes de repostar.</p>
            
            <div class="cheapest-box">
                <h3>📍 El precio más bajo de hoy (España)</h3>
                <div class="cheapest-grid">
                    <div class="cheapest-item">
                        <strong>Gasolina 95:</strong> <span>${cheapestStations.G95 ? cheapestStations.G95.price.toFixed(3) + ' €/L' : 'No disponible'}</span>
                        <small>${cheapestStations.G95 ? cheapestStations.G95.name + ' - ' + cheapestStations.G95.locality + ' (' + cheapestStations.G95.province + ')' : ''}</small>
                    </div>
                    <div class="cheapest-item">
                        <strong>Diésel A:</strong> <span>${cheapestStations.GOA ? cheapestStations.GOA.price.toFixed(3) + ' €/L' : 'No disponible'}</span>
                        <small>${cheapestStations.GOA ? cheapestStations.GOA.name + ' - ' + cheapestStations.GOA.locality + ' (' + cheapestStations.GOA.province + ')' : ''}</small>
                    </div>
                </div>
            </div>

            <h2>Análisis Regional: Provincias más baratas</h2>
            <p>A continuación, detallamos las 5 provincias que hoy ofrecen los mejores precios medios para Gasolina 95:</p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Provincia</th>
                        <th>Precio Medio G95</th>
                    </tr>
                </thead>
                <tbody>
                    ${topProvinces95.map(p => `<tr><td>${p.name}</td><td>${p.avgs.G95.toFixed(3)} €/L</td></tr>`).join('')}
                </tbody>
            </table>

            <h2>Ranking de Marcas (Low-cost vs Tradicionales)</h2>
            <p>Las marcas independientes y cadenas automáticas continúan liderando el ahorro. Aquí las 5 marcas con mejor promedio nacional hoy:</p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Marca / Rótulo</th>
                        <th>Precio Medio G95</th>
                    </tr>
                </thead>
                <tbody>
                    ${topBrands95.map(b => `<tr><td>${b.name}</td><td>${b.avgs.G95.toFixed(3)} €/L</td></tr>`).join('')}
                </tbody>
            </table>

            <div class="pro-tip">
                <h4>💡 Consejo de ahorro</h4>
                <p>Repostar en estaciones situadas en polígonos industriales o a las afueras de los centros urbanos puede suponer un ahorro de hasta 12€ por depósito lleno (50L). Usa nuestro mapa interactivo en tiempo real para localizar estas estaciones en tu ruta.</p>
            </div>
        `;

        const imageIndex = now.getDate() % HERO_IMAGES.length;
        const heroImage = HERO_IMAGES[imageIndex];
        const canonicalUrl = `https://xn--gasolinerasespaa-lub.es/blog/${fileDate}-precios-gasolina.html`;

        let template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
        template = template.replace(/{{TITLE}}/g, title)
                          .replace(/{{DESCRIPTION}}/g, description)
                          .replace(/{{CANONICAL}}/g, canonicalUrl)
                          .replace(/{{DATE}}/g, dateStr)
                          .replace(/{{HERO_IMAGE}}/g, heroImage)
                          .replace(/{{CONTENT}}/g, content);

        if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR);
        
        const fileName = `${fileDate}-precios-gasolina.html`;
        const filePath = path.join(BLOG_DIR, fileName);
        fs.writeFileSync(filePath, template);
        console.log(`Blog post created: ${fileName}`);

        updateSitemap(`https://xn--gasolinerasespaa-lub.es/blog/${fileName}`);

        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(PRICES_JSON_PATH, JSON.stringify(data));
        console.log(`Static data saved: assets/data/prices.json`);

        updateBlogIndex();
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
            .slice(0, 1);

        const postsHtml = files.map(f => {
            const date = f.substring(0, 10);
            const d = new Date(date);
            const imgIdx = d.getDate() % HERO_IMAGES.length;
            const thumb = HERO_IMAGES[imgIdx];
            
            return `<a href="/blog/${f}" class="news-card blog-list-card" data-date="${date}">
                <div class="news-card-badge" id="todayBadge">HOY</div>
                <div class="news-card-img"><div style="background:url('${thumb}') center/cover"></div></div>
                <div class="news-card-date" id="blogCardDate">${date}</div>
                <h3 class="news-card-title" id="blogCardTitle">Informe Diario: Precios del ${date}</h3>
                <p class="news-card-excerpt">Análisis profesional de precios, tendencias por provincias y marcas más baratas del día.</p>
            </a>`;
        }).join('\n');

        let indexContent = fs.readFileSync(indexPath, 'utf-8');
        const marker = '<!-- LATEST_BLOG_POSTS -->';
        const regex = new RegExp(`${marker}[\\s\\S]*${marker}`, 'g');
        
        if (indexContent.includes(marker)) {
            indexContent = indexContent.replace(regex, `${marker}\n${postsHtml}\n${marker}`);
            
            // Update the CTA button link as well
            if (files.length > 0) {
                const latestFile = files[0];
                const btnRegex = /id="blogBtnLink" href="[^"]*"/;
                indexContent = indexContent.replace(btnRegex, `id="blogBtnLink" href="/blog/${latestFile}"`);
            }

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
        <h2 class="post-card-title">Análisis de precios: ${date}</h2>
        <p class="post-card-excerpt">Consulta el informe detallado de hoy con medias nacionales, provinciales y las mejores marcas.</p>
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
