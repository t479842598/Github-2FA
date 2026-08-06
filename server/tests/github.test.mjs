import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { CookieJar, extractFormToken, extractRequiredFields, extractPat, extractScopes, loginToGithub, createPat, checkSession, checkPat, listPats, revokePat, GhError } from '../github.js'

// ---------- CookieJar ----------
test('CookieJar 解析 Set-Cookie', () => {
  const jar = new CookieJar()
  jar.setFromHeaders([
    '_gh_sess=abc123; Path=/; HttpOnly; SameSite=Lax',
    'logged_in=yes; Path=/; Domain=.github.com; Secure; HttpOnly; Max-Age=31536000',
    'user_session=xyz; Path=/; Domain=.github.com; HttpOnly; Expires=Wed, 01 Jan 2030 00:00:00 GMT',
  ], 'github.com')
  assert.equal(jar.cookies.length, 3)
  const sess = jar.cookies.find((c) => c.name === 'user_session')
  assert.equal(sess.domain, 'github.com')
  assert.equal(sess.path, '/')
  assert.equal(sess.httpOnly, true)
  assert.ok(sess.expires > Date.now())
  const loggedIn = jar.cookies.find((c) => c.name === 'logged_in')
  assert.equal(loggedIn.secure, true)
})

test('CookieJar buildHeader 按域匹配', () => {
  const jar = CookieJar.fromJSON([
    { name: 'a', value: '1', domain: 'github.com', path: '/' },
    { name: 'b', value: '2', domain: 'api.github.com', path: '/' },
    { name: 'c', value: '3', domain: '', path: '/' },
  ])
  const header = jar.buildHeader('https://github.com/settings/tokens')
  assert.ok(header.includes('a=1'))
  assert.ok(!header.includes('b=2')) // api.github.com 不匹配
  assert.ok(header.includes('c=3'))
})

test('CookieJar 过期与替换', () => {
  const jar = new CookieJar()
  jar.setFromHeaders(['x=old; Path=/; Max-Age=0'], 'github.com')
  assert.equal(jar.buildHeader('https://github.com/'), '')
  jar.setFromHeaders(['x=new; Path=/; Max-Age=3600'], 'github.com')
  assert.equal(jar.get('x'), 'new')
})

test('CookieJar 序列化往返', () => {
  const jar = new CookieJar()
  jar.setFromHeaders(['user_session=abc; Path=/; Domain=.github.com; HttpOnly'], 'github.com')
  const json = jar.toJSON()
  const jar2 = CookieJar.fromJSON(json)
  assert.equal(jar2.get('user_session'), 'abc')
})

// ---------- HTML 解析 ----------
test('extractFormToken 两种属性顺序', () => {
  const html1 = '<input name="authenticity_token" value="tok123" type="hidden">'
  const html2 = '<input type="hidden" value="tok456" name="authenticity_token">'
  assert.equal(extractFormToken(html1), 'tok123')
  assert.equal(extractFormToken(html2), 'tok456')
  assert.equal(extractFormToken('<input name="timestamp_secret" value="ts789">', 'timestamp_secret'), 'ts789')
  assert.equal(extractFormToken('<div>nothing</div>'), null)
})

test('extractRequiredFields', () => {
  const html = '<input name="required_field_abc123" value=""> <input name="required_field_xyz" value="">'
  assert.deepEqual(extractRequiredFields(html), ['required_field_abc123', 'required_field_xyz'])
})

test('extractPat 提取 ghp_ 令牌', () => {
  const html = 'Make sure to copy your new personal access token now: <code>ghp_abcdefghijklmnopqrstuvwxyzABCDEF1234</code>'
  assert.equal(extractPat(html), 'ghp_abcdefghijklmnopqrstuvwxyzABCDEF1234')
  assert.equal(extractPat('no token here'), null)
})

test('extractScopes 解析 checkbox', () => {
  const html = `
    <input type="checkbox" name="token_scopes[]" value="repo">
    <input type="checkbox" name="token_scopes[]" value="workflow">
    <input type="checkbox" name="token_scopes[]" value="gist">
  `
  assert.deepEqual(extractScopes(html), ['repo', 'workflow', 'gist'])
})

// ---------- 登录流程（mock fetch） ----------
function mockFetch(routes) {
  mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const u = new URL(url)
    const path = u.pathname + u.search
    const route = routes[path]
    if (!route) throw new Error(`unmocked: ${path}`)
    const res = await route(opts)
    return {
      status: res.status,
      headers: { getSetCookie: () => res.cookies || [], get: () => res.location || null },
      text: async () => res.body || '',
      json: async () => (res.json ? res.json() : {}),
    }
  })
}

const LOGIN_PAGE = `
<html><body>
<form action="/session">
<input name="authenticity_token" value="auth123" type="hidden">
<input name="timestamp_secret" value="ts123" type="hidden">
<input name="required_field_abc" value="">
</form>
</body></html>`

test('登录成功（无 2FA）', async () => {
  mockFetch({
    '/login': async () => ({ status: 200, cookies: ['_gh_sess=init; Path=/'], body: LOGIN_PAGE }),
    '/session': async (opts) => {
      const body = new URLSearchParams(opts.body)
      assert.equal(body.get('login'), 'myuser')
      assert.equal(body.get('password'), 'mypass')
      assert.equal(body.get('authenticity_token'), 'auth123')
      assert.ok(body.get('required_field_abc') !== null)
      return { status: 302, cookies: ['logged_in=yes; Path=/; Domain=.github.com', 'user_session=u123; Path=/; Domain=.github.com; HttpOnly'] }
    },
    '/': async () => ({ status: 200, body: '<html>dashboard</html>' }),
  })
  const jar = new CookieJar()
  await loginToGithub({ username: 'myuser', password: 'mypass', secret: null, jar })
  assert.equal(jar.get('user_session'), 'u123')
  assert.equal(jar.get('logged_in'), 'yes')
})

test('登录 + 自动 2FA', async () => {
  const TWO_FA_PAGE = `
  <html><body>
  <input name="authenticity_token" value="otpAuth456" type="hidden">
  <input name="timestamp_secret" value="otpTs456" type="hidden">
  <input name="otp" value="">
  </body></html>`
  let otpSubmitted = null
  mockFetch({
    '/login': async () => ({ status: 200, cookies: ['_gh_sess=init; Path=/'], body: LOGIN_PAGE }),
    '/session': async () => ({ status: 200, cookies: ['_gh_sess=mid; Path=/'], body: TWO_FA_PAGE }),
    '/sessions/two-factor': async (opts) => {
      const body = new URLSearchParams(opts.body)
      otpSubmitted = body.get('otp')
      assert.equal(body.get('authenticity_token'), 'otpAuth456')
      return { status: 302, cookies: ['logged_in=yes; Path=/; Domain=.github.com', 'user_session=u123; Path=/; Domain=.github.com; HttpOnly'] }
    },
    '/': async () => ({ status: 200, body: '<html>dashboard</html>' }),
  })
  const jar = new CookieJar()
  await loginToGithub({ username: 'myuser', password: 'mypass', secret: 'KDI5GIHR6P3HECLE', jar })
  assert.match(otpSubmitted, /^\d{6}$/)
  assert.equal(jar.get('user_session'), 'u123')
})

test('登录页 logged_in=no cookie 不误判为已登录', async () => {
  mockFetch({
    '/login': async () => ({ status: 200, cookies: ['_gh_sess=init; Path=/', 'logged_in=no; Path=/; Domain=.github.com'], body: LOGIN_PAGE }),
    '/session': async () => ({ status: 200, cookies: [], body: '<html>Incorrect username or password.</html>' }),
  })
  const jar = new CookieJar()
  await assert.rejects(
    () => loginToGithub({ username: 'u', password: 'bad', secret: null, jar }),
    (e) => e instanceof GhError && e.code === 'BAD_CREDENTIALS'
  )
})

test('2FA 失败（无 secret）', async () => {
  mockFetch({
    '/login': async () => ({ status: 200, cookies: ['_gh_sess=init; Path=/'], body: LOGIN_PAGE }),
    '/session': async () => ({ status: 200, body: '<html><input name="otp" value=""></html>' }),
  })
  const jar = new CookieJar()
  await assert.rejects(
    () => loginToGithub({ username: 'u', password: 'p', secret: null, jar }),
    (e) => e instanceof GhError && e.code === 'TWO_FA_FAILED'
  )
})

test('密码错误分类', async () => {
  mockFetch({
    '/login': async () => ({ status: 200, cookies: ['_gh_sess=init; Path=/'], body: LOGIN_PAGE }),
    '/session': async () => ({ status: 200, body: '<html>Incorrect username or password.</html>' }),
  })
  const jar = new CookieJar()
  await assert.rejects(
    () => loginToGithub({ username: 'u', password: 'bad', secret: null, jar }),
    (e) => e instanceof GhError && e.code === 'BAD_CREDENTIALS'
  )
})

test('webauthn 风控分类', async () => {
  mockFetch({
    '/login': async () => ({ status: 200, cookies: ['_gh_sess=init; Path=/'], body: LOGIN_PAGE }),
    '/session': async () => ({ status: 200, body: '<html>Use your passkey to sign in. WebAuthn</html>' }),
  })
  const jar = new CookieJar()
  await assert.rejects(
    () => loginToGithub({ username: 'u', password: 'p', secret: 'ABC', jar }),
    (e) => e instanceof GhError && e.code === 'WEBAUTHN_REQUIRED'
  )
})

test('设备验证风控分类', async () => {
  mockFetch({
    '/login': async () => ({ status: 200, cookies: ['_gh_sess=init; Path=/'], body: LOGIN_PAGE }),
    '/session': async () => ({ status: 200, body: '<html>Device verification required. Verify your identity.</html>' }),
  })
  const jar = new CookieJar()
  await assert.rejects(
    () => loginToGithub({ username: 'u', password: 'p', secret: 'ABC', jar }),
    (e) => e instanceof GhError && e.code === 'VERIFICATION_REQUIRED'
  )
})

// ---------- PAT 创建 ----------
const TOKENS_NEW_PAGE = `
<html><body>
<form action="/settings/tokens">
<input name="authenticity_token" value="patAuth789" type="hidden">
<input type="checkbox" name="token_scopes[]" value="repo">
<input type="checkbox" name="token_scopes[]" value="workflow">
</form>
</body></html>`

test('createPat 成功并提取令牌', async () => {
  mockFetch({
    '/settings/tokens/new': async () => ({ status: 200, cookies: ['_gh_sess=s; Path=/'], body: TOKENS_NEW_PAGE }),
    '/settings/tokens': async (opts) => {
      const body = new URLSearchParams(opts.body)
      assert.equal(body.get('authenticity_token'), 'patAuth789')
      assert.deepEqual(body.getAll('oauth_access[scopes][]'), ['repo', 'workflow'])
      assert.equal(body.get('oauth_access[default_expires_at]'), '30')
      assert.match(body.get('oauth_access[description]'), /^ghvault-/)
      return { status: 200, body: '<html>Your new personal access token: <code>ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij</code></html>' }
    },
  })
  const jar = CookieJar.fromJSON([{ name: 'user_session', value: 'u1', domain: 'github.com', path: '/' }])
  const { token, name } = await createPat({ username: 'myuser', jar, scopes: ['repo', 'workflow'], expiration: '30' })
  assert.equal(token, 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')
  assert.ok(name.startsWith('ghvault-'))
})

test('createPat 未登录报错', async () => {
  mockFetch({
    '/settings/tokens/new': async () => ({ status: 302, cookies: [], body: '' }),
  })
  const jar = CookieJar.fromJSON([{ name: 'other', value: 'x', domain: 'github.com', path: '/' }])
  await assert.rejects(
    () => createPat({ username: 'u', jar }),
    (e) => e instanceof GhError && e.code === 'NOT_LOGGED_IN'
  )
})

// ---------- 会话检测 / PAT 检测 / PAT 列表 ----------
test('checkSession：有效会话', async () => {
  mockFetch({
    '/settings/profile': async () => ({ status: 200, body: '<html><meta name="user-login" content="myuser"><title>Profile</title></html>' }),
  })
  const jar = CookieJar.fromJSON([{ name: 'user_session', value: 'u1', domain: 'github.com', path: '/' }])
  const r = await checkSession(jar)
  assert.equal(r.valid, true)
  assert.equal(r.username, 'myuser')
})

test('checkSession：失效（重定向到登录页）', async () => {
  mockFetch({
    '/settings/profile': async () => ({ status: 200, body: '<html>Sign in to GitHub <form action="/session"></html>' }),
  })
  const jar = CookieJar.fromJSON([{ name: 'user_session', value: 'expired', domain: 'github.com', path: '/' }])
  const r = await checkSession(jar)
  assert.equal(r.valid, false)
})

test('checkSession：无会话', async () => {
  const r = await checkSession(new CookieJar())
  assert.equal(r.valid, false)
  assert.equal(r.reason, 'no_session')
})

test('checkPat：有效/失效/网络错误', async () => {
  mockFetch({
    '/user': async (opts) => {
      const h = opts.headers || {}
      const auth = typeof h.get === 'function' ? h.get('authorization') : (h.Authorization || h.authorization)
      if (auth === 'Bearer good-token') {
        return { status: 200, body: JSON.stringify({ login: 'myuser' }), json: async () => ({ login: 'myuser' }) }
      }
      return { status: 401, body: '{}', json: async () => ({}) }
    },
  })
  const ok = await checkPat('good-token')
  assert.equal(ok.valid, true)
  assert.equal(ok.login, 'myuser')
  const bad = await checkPat('bad-token')
  assert.equal(bad.valid, false)
})

test('listPats：解析 token 卡片', async () => {
  mockFetch({
    '/settings/tokens': async () => ({
      status: 200,
      body: `<html><div class="listgroup">
        <div id="access-token-12345" class="access-token js-revoke-item" data-id="12345" data-type="token">
          <div class="listgroup-item">
            <strong>my-token</strong>
            <span class="Label">repo</span><span class="Label">workflow</span>
            <span>Expires in 30 days</span>
            <span>Last used 2 days ago</span>
          </div>
        </div>
        <div id="access-token-67890" class="access-token js-revoke-item" data-id="67890" data-type="token">
          <div class="listgroup-item"><strong>other</strong><span class="Label">gist</span></div>
        </div>
      </div></html>`,
    }),
  })
  const jar = CookieJar.fromJSON([{ name: 'user_session', value: 'u1', domain: 'github.com', path: '/' }])
  const pats = await listPats(jar)
  assert.equal(pats.length, 2)
  assert.equal(pats[0].id, '12345')
  assert.equal(pats[0].name, 'my-token')
  assert.deepEqual(pats[0].scopes, ['repo', 'workflow'])
  assert.ok(pats[0].expires)
})

test('listPats：未登录报错', async () => {
  mockFetch({
    '/settings/tokens': async () => ({ status: 200, body: '<html>Sign in to GitHub</html>' }),
  })
  const jar = CookieJar.fromJSON([{ name: 'user_session', value: 'exp', domain: 'github.com', path: '/' }])
  await assert.rejects(() => listPats(jar), (e) => e instanceof GhError && e.code === 'NOT_LOGGED_IN')
})

test('revokePat：表单提交', async () => {
  mockFetch({
    '/settings/tokens': async () => ({
      status: 200,
      body: `<html><form class="js-revoke-access-form" data-id="12345" action="/settings/tokens/12345" method="post">
        <input type="hidden" name="_method" value="delete">
        <input type="hidden" name="authenticity_token" value="revokeTok">
      </form></html>`,
    }),
    '/settings/tokens/12345': async (opts) => {
      const body = new URLSearchParams(opts.body)
      assert.equal(body.get('authenticity_token'), 'revokeTok')
      assert.equal(body.get('_method'), 'delete')
      return { status: 200, body: '<html>deleted</html>' }
    },
  })
  const jar = CookieJar.fromJSON([{ name: 'user_session', value: 'u1', domain: 'github.com', path: '/' }])
  const r = await revokePat(jar, '12345')
  assert.equal(r, true)
})
