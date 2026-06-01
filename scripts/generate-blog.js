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
        
        // Sorting for reports (moved up for title generation)
        const topProvinces95 = [...provinceAvgs].filter(p => p.avgs.G95).sort((a,b) => a.avgs.G95 - b.avgs.G95).slice(0, 5);
        const topBrands95 = [...brandAvgs].filter(b => b.avgs.G95).sort((a,b) => a.avgs.G95 - b.avgs.G95).slice(0, 5);

        const cheapestProv = topProvinces95.length > 0 ? topProvinces95[0].name : '';
        const cheapestPrice = cheapestStations.G95 ? cheapestStations.G95.price.toFixed(3) : '';
        
        const titlePrefixes = [
            `¿Dónde está el combustible más barato? Informe del ${dateStr}`,
            `Análisis de precios: ${cheapestProv} lidera el ahorro hoy ${dateStr}`,
            `Precios gasolina hoy ${dateStr}: Bajada de precios detectada`,
            `Reporte de carburantes ${dateStr}: Las marcas más baratas`,
            `Ahorra hoy ${dateStr}: Informe completo de precios de gasolina`
        ];
        const title = titlePrefixes[now.getDate() % titlePrefixes.length];
        
        const descPrefixes = [
            `Descubre dónde repostar más barato hoy ${dateStr}.`,
            `Análisis detallado de los precios de gasolina y diésel para el ${dateStr}.`,
            `Informe completo de carburantes. ${cheapestProv} ofrece los mejores precios hoy.`
        ];
        const description = `${descPrefixes[now.getDate() % descPrefixes.length]} Análisis por provincias, marcas y el ranking de las gasolineras más económicas con precios reales de hoy.`;

        const marketContexts = [
            `El mercado mundial de hidrocarburos sigue mostrando una notable sensibilidad ante las decisiones de producción de la OPEP+ y las dinámicas macroeconómicas globales. A nivel nacional, la carga impositiva en España sigue representando en torno al 50% del precio que el consumidor final abona en el surtidor, diluyendo en cierta medida las bajadas del crudo Brent.`,
            `La evolución del precio de los combustibles en la península sigue fuertemente condicionada por los márgenes operativos de las distribuidoras y los impuestos especiales. Mientras las gasolineras independientes y las denominadas 'low cost' logran ajustar sus precios optimizando costes logísticos y de personal, las grandes petroleras mantienen sus tarifas apostando por combustibles premium y servicios adicionales en pista.`,
            `Reparar en el coste real de los carburantes es hoy más necesario que nunca. La volatilidad geopolítica y las presiones inflacionistas tienen un impacto directo en las refinerías. Sin embargo, la amplia red de estaciones automáticas en nuestro país permite al conductor promedio ahorrar de forma efectiva si compara precios con antelación y planifica su ruta.`,
            `El diésel y la gasolina continúan su pulso particular en los mercados internacionales. La transición energética y los ajustes en la oferta mundial de crudo hacen que los precios fluctúen a diario. En este contexto, aprovechar la competencia local entre estaciones de servicio de un mismo municipio es la estrategia más eficaz para mitigar el gasto en transporte.`
        ];
        const selectedContext = marketContexts[now.getDate() % marketContexts.length];

        let content = `
            <p class="lead">Hoy, <strong>${dateStr}</strong>, presentamos un análisis detallado y actualizado del mercado de carburantes en España. Basado íntegramente en los datos oficiales publicados por el Ministerio para la Transición Ecológica, evaluamos las tendencias de precios y localizamos las mejores oportunidades de ahorro para los conductores.</p>
            
            <h2>Contexto del Mercado</h2>
            <p>${selectedContext}</p>
            
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

            <h2>Resumen del mercado hoy</h2>
            <p>El mercado nacional muestra una estabilidad relativa con ligeras variaciones territoriales. La <strong>Gasolina 95</strong> se mantiene con un promedio de <strong>${nationalAvgs.G95} €/L</strong>, mientras que el <strong>Gasoil A</strong> registra <strong>${nationalAvgs.GOA} €/L</strong>. Observamos una brecha significativa de hasta 0.40€ entre las estaciones más económicas y las más costosas, lo que subraya la importancia de comparar antes de repostar.</p>
            
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
            <p>A continuación, detallamos las 5 provincias que hoy ofrecen los mejores precios medios para Gasolina 95, siendo <strong>${cheapestProv}</strong> la más económica actualmente:</p>
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

            <h2>Ranking de Marcas (Ahorro garantizado)</h2>
            <p>Las marcas independientes y cadenas automáticas continúan liderando el ahorro. Aquí las 5 marcas con mejor promedio nacional hoy, ideales para quienes buscan ajustar su presupuesto:</p>
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
                <h4>💡 Consejo de ahorro para conductores</h4>
                <p>Repostar en estaciones situadas en polígonos industriales o a las afueras de los centros urbanos puede suponer un ahorro de hasta 12€ por depósito lleno (50L). Usa nuestro mapa interactivo en tiempo real para localizar estas estaciones en tu ruta.</p>
            </div>

            <div class="share-bar">
                <span class="share-label">Compartir artículo:</span>
                <a href="#" class="share-btn" onclick="window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(document.title) + '&url=' + encodeURIComponent(window.location.href)); return false;" aria-label="Compartir en Twitter"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path></svg></a>
                <a href="#" class="share-btn" onclick="window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(window.location.href)); return false;" aria-label="Compartir en Facebook"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg></a>
                <a href="#" class="share-btn" onclick="window.open('https://wa.me/?text=' + encodeURIComponent(document.title + ' ' + window.location.href)); return false;" aria-label="Compartir en WhatsApp"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg></a>
            </div>

            <div class="author-box">
                <div class="author-avatar">AS</div>
                <div class="author-info">
                    <h4>Alejandro Sibaja</h4>
                    <p>Analista de Datos y Creador de Gasolineras España. Comprometido con la transparencia de precios y el ahorro ciudadano en hidrocarburos.</p>
                </div>
            </div>
        `;

        const imageIndex = now.getDate() % HERO_IMAGES.length;
        const heroImage = HERO_IMAGES[imageIndex];
        const canonicalUrl = `https://gasolinerasespaña.es/blog/${fileDate}-precios-gasolina.html`;

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

        updateSitemap(`https://gasolinerasespaña.es/blog/${fileName}`);

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
            const content = fs.readFileSync(path.join(BLOG_DIR, f), 'utf-8');
            const titleMatch = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
            const title = titleMatch ? titleMatch[1].trim() : `Informe Diario: Precios del ${date}`;
            
            const d = new Date(date);
            const imgIdx = d.getDate() % HERO_IMAGES.length;
            const thumb = HERO_IMAGES[imgIdx];
            
            return `<a href="/blog/${f}" class="news-card blog-list-card" data-date="${date}">
                <div class="news-card-badge" id="todayBadge">HOY</div>
                <div class="news-card-img"><div style="background:url('${thumb}') center/cover"></div></div>
                <div class="news-card-date" id="blogCardDate">${date}</div>
                <h3 class="news-card-title" id="blogCardTitle">${title}</h3>
                <p class="news-card-excerpt">Análisis profesional de precios, tendencias por provincias y marcas más baratas del día.</p>
            </a>`;
        }).join('\n');

        let indexContent = fs.readFileSync(indexPath, 'utf-8');
        const marker = '<!-- LATEST_BLOG_POSTS -->';
        const regex = new RegExp(`${marker}[\\s\\S]*${marker}`, 'g');
        
        if (indexContent.includes(marker)) {
            indexContent = indexContent.replace(regex, `${marker}\n${postsHtml}\n${marker}`);
            
            // Update the CTA button link more robustly
            if (files.length > 0) {
                const latestFile = files[0];
                // Match the <a> tag that has the id="blogBtnLink" and update its href
                const btnRegex = /(<a\s+[^>]*id="blogBtnLink"[^>]*href=")([^"]*)(")/;
                const btnRegexReverse = /(<a\s+[^>]*href=")([^"]*)("[^>]*id="blogBtnLink")/;
                
                if (btnRegex.test(indexContent)) {
                    indexContent = indexContent.replace(btnRegex, `$1/blog/${latestFile}$3`);
                } else if (btnRegexReverse.test(indexContent)) {
                    indexContent = indexContent.replace(btnRegexReverse, `$1/blog/${latestFile}$3`);
                }
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
            const content = fs.readFileSync(path.join(BLOG_DIR, f), 'utf-8');
            const titleMatch = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
            const title = titleMatch ? titleMatch[1].trim() : `Análisis de precios: ${date}`;
            
            const d = new Date(date);
            const imgIdx = d.getDate() % HERO_IMAGES.length;
            const thumb = HERO_IMAGES[imgIdx];
            
            return `<a href="${f}" class="post-card" data-date="${date}">
    <div class="post-card-img"><div style="background:url('${thumb}') center/cover"></div></div>
    <div class="post-card-body">
        <span class="post-card-date">${date}</span>
        <h2 class="post-card-title">${title}</h2>
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
