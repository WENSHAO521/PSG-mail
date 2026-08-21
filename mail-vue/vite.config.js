import {defineConfig, loadEnv} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { createRequire } from 'module'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'
import {VitePWA} from 'vite-plugin-pwa';

const _require = createRequire(import.meta.url)
const pkg = _require('./package.json')

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, process.cwd(), 'VITE')
    return {
        server: {
            host: true,
            port: 3001,
            hmr: true,
        },
        base: env.VITE_STATIC_URL || '/',
        plugins: [
            vue(),
            VitePWA({
                // Custom SW (src/psg-mail-sw.js) replaces the auto-generated one so
                // it can also handle standards Web Push background messages — a site
                // can only run one service worker per scope. The old
                // firebase-messaging-sw.js stays in the repo, unreferenced, until the
                // Firebase web push path is fully retired (see web-push.js's header).
                strategies: 'injectManifest',
                srcDir: 'src',
                filename: 'psg-mail-sw.js',
                injectRegister: 'script-defer',
                manifest: {
                    name: 'Panorama Scholarly Group Mail',
                    short_name: env.VITE_PWA_NAME,
                    description: 'PSG Mail — Panorama Scholarly Group internal email',
                    background_color: '#1E5940',
                    theme_color: '#1E5940',
                    display: 'standalone',
                    start_url: '/',
                    icons: [
                        { src: 'pwa-192.png',         sizes: '192x192', type: 'image/png' },
                        { src: 'pwa-512.png',          sizes: '512x512', type: 'image/png' },
                        { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                    ],
                },
                injectManifest: {
                    // Matches the previous generateSW globPatterns: [] — no offline precache.
                    globPatterns: [],
                }
            }),
            AutoImport({ resolvers: [ElementPlusResolver()] }),
            Components({ resolvers: [ElementPlusResolver()] }),
        ],
        define: {
            __APP_VERSION__: JSON.stringify(pkg.version),
        },
        resolve: {
            alias: { '@': path.resolve(__dirname, 'src') }
        },
        build: {
            target: 'es2022',
            outDir: env.VITE_OUT_DIR || 'dist',
            emptyOutDir: true,
            assetsInclude: ['**/*.json'],
            // Don't report compressed sizes — speeds up CI/build output
            reportCompressedSize: false,
            chunkSizeWarningLimit: 1200,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        // TinyMCE is ~1 MB — must be its own cached chunk
                        if (id.includes('node_modules/tinymce')) {
                            return 'vendor-tinymce';
                        }
                        // ECharts + zrender
                        if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
                            return 'vendor-echarts';
                        }
                        // Element Plus UI
                        if (id.includes('node_modules/element-plus') || id.includes('node_modules/@element-plus')) {
                            return 'vendor-element-plus';
                        }
                        // Vue core + Pinia
                        if (id.includes('node_modules/vue') || id.includes('node_modules/@vue') || id.includes('node_modules/pinia')) {
                            return 'vendor-vue';
                        }
                        // VueUse
                        if (id.includes('node_modules/@vueuse')) {
                            return 'vendor-vueuse';
                        }
                        // Iconify runtime
                        if (id.includes('node_modules/@iconify')) {
                            return 'vendor-iconify';
                        }
                        // Lodash
                        if (id.includes('node_modules/lodash')) {
                            return 'vendor-lodash';
                        }
                        // Date utilities
                        if (id.includes('node_modules/dayjs')) {
                            return 'vendor-dayjs';
                        }
                    }
                }
            }
        },
        // CSS optimization
        css: {
            devSourcemap: false,
        },
        // Dependency pre-bundling — faster cold starts in dev
        optimizeDeps: {
            include: [
                'vue', 'pinia', 'vue-router',
                'element-plus', '@element-plus/icons-vue',
                '@vueuse/core', '@vueuse/components',
                'dayjs', 'axios', 'lodash-es',
                '@iconify/vue',
            ],
            exclude: ['tinymce'],  // TinyMCE handles its own loading
        },
    }
})
