import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { createServerApp } from '../src/server/app.js'
import { loadServerConfig } from '../src/server/config/env.js'
import { type AppContainer, createAppContainer } from '../src/server/container.js'

describe('Production Static SPA Serving & Healthcheck', () => {
  let container: AppContainer | null = null
  let tempFixtureDir: string | null = null

  afterEach(() => {
    container?.dispose()
    container = null
    if (tempFixtureDir && existsSync(tempFixtureDir)) {
      rmSync(tempFixtureDir, { recursive: true, force: true })
      tempFixtureDir = null
    }
  })

  it('serves /api/health, immutable /assets/*, SPA deep-link fallback, and JSON 404 for unknown /api/*', async () => {
    const config = loadServerConfig({
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3000',
      DATABASE_PATH: ':memory:',
      SESSION_TTL_HOURS: '24',
      COOKIE_SECURE: 'auto',
    })

    container = createAppContainer(config)

    let distDir = resolve('./dist/client')
    if (!existsSync(resolve(distDir, 'index.html'))) {
      tempFixtureDir = mkdtempSync(join(tmpdir(), 'stokku-dist-test-'))
      distDir = tempFixtureDir
      mkdirSync(resolve(distDir, 'assets'), { recursive: true })
      writeFileSync(
        resolve(distDir, 'index.html'),
        '<!doctype html><html><body><div id="root"></div></body></html>',
        'utf-8',
      )
      writeFileSync(
        resolve(distDir, 'assets', 'index-test.js'),
        'console.log("stokku test bundle")',
        'utf-8',
      )
    }

    const app = createServerApp({
      services: container.services,
      config: {
        nodeEnv: config.nodeEnv,
        corsOrigins: config.corsOrigins,
      },
      clientDistDir: distDir,
    })

    // 1. Health endpoint for Docker HEALTHCHECK
    const healthRes = await app.request('http://localhost:3000/api/health')
    assert.equal(healthRes.status, 200)
    const healthBody = (await healthRes.json()) as {
      ok: boolean
      data: { status: string }
    }
    assert.equal(healthBody.ok, true)
    assert.equal(healthBody.data.status, 'ok')

    // 2. Unknown /api/* must return structured JSON 404, NOT index.html
    const unknownApiRes = await app.request('http://localhost:3000/api/does-not-exist')
    assert.equal(unknownApiRes.status, 404)
    const unknownApiBody = (await unknownApiRes.json()) as {
      ok: boolean
      error: { code: string }
    }
    assert.equal(unknownApiBody.ok, false)
    assert.equal(unknownApiBody.error.code, 'NOT_FOUND')

    // 3. Root `/` and SPA deep link `/pos` serve index.html with Cache-Control: no-cache
    const rootRes = await app.request('http://localhost:3000/')
    assert.equal(rootRes.status, 200)
    assert.equal(rootRes.headers.get('cache-control'), 'no-cache')
    const rootHtml = await rootRes.text()
    assert(rootHtml.includes('<div id="root"></div>'))

    const deepLinkRes = await app.request('http://localhost:3000/pos')
    assert.equal(deepLinkRes.status, 200)
    assert.equal(deepLinkRes.headers.get('cache-control'), 'no-cache')
    const deepLinkHtml = await deepLinkRes.text()
    assert(deepLinkHtml.includes('<div id="root"></div>'))

    // 4. Built /assets/* file is served with immutable 1-year Cache-Control
    const assetsFiles = readdirSync(resolve(distDir, 'assets'))
    const jsAsset = assetsFiles.find((f) => f.endsWith('.js'))
    assert(jsAsset, 'Expected compiled JS bundle in dist/client/assets')

    const assetRes = await app.request(`http://localhost:3000/assets/${jsAsset}`)
    assert.equal(assetRes.status, 200)
    assert.equal(
      assetRes.headers.get('cache-control'),
      'public, max-age=31536000, immutable',
    )
  })
})
