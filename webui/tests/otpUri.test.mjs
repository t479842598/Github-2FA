import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOtpUri, buildOtpUri } from '../src/utils/otpUri.js'

test('标准 GitHub URI 解析', () => {
  const r = parseOtpUri('otpauth://totp/GitHub:tqH8iLZ7VEV9?secret=KDI5GIHR6P3HECLE&issuer=GitHub')
  assert.equal(r.username, 'tqH8iLZ7VEV9')
  assert.equal(r.issuer, 'GitHub')
  assert.equal(r.secret, 'KDI5GIHR6P3HECLE')
  assert.equal(r.digits, 6)
  assert.equal(r.period, 30)
})

test('纯 account label（无 issuer）', () => {
  const r = parseOtpUri('otpauth://totp/plainuser?secret=ABCDEFGH')
  assert.equal(r.username, 'plainuser')
  assert.equal(r.issuer, '')
  assert.equal(r.secret, 'ABCDEFGH')
})

test('label 内嵌 issuer 且无 issuer 参数', () => {
  const r = parseOtpUri('otpauth://totp/Example:user1?secret=SECRET123')
  assert.equal(r.username, 'user1')
  assert.equal(r.issuer, 'Example')
})

test('digits/period 自定义', () => {
  const r = parseOtpUri('otpauth://totp/Test:u?secret=X&digits=8&period=60')
  assert.equal(r.digits, 8)
  assert.equal(r.period, 60)
})

test('异常 URI 报错', () => {
  assert.throws(() => parseOtpUri(''), /URI/)
  assert.throws(() => parseOtpUri('https://github.com'), /otpauth/)
  assert.throws(() => parseOtpUri('otpauth://hotp/x?secret=A'), /TOTP/)
  assert.throws(() => parseOtpUri('otpauth://totp/?secret=A'), /账号/)
  assert.throws(() => parseOtpUri('otpauth://totp/user'), /secret/)
})

test('组装与解析往返', () => {
  const uri = buildOtpUri({ username: 'abc', secret: 'SECRET', issuer: 'GitHub' })
  assert.equal(uri, 'otpauth://totp/GitHub%3Aabc?secret=SECRET&issuer=GitHub')
  const r = parseOtpUri(uri)
  assert.equal(r.username, 'abc')
  assert.equal(r.issuer, 'GitHub')
  assert.equal(r.secret, 'SECRET')
})

test('中文 label URL 编码', () => {
  const r = parseOtpUri('otpauth://totp/GitHub:%E6%B5%8B%E8%AF%95?secret=XYZ')
  assert.equal(r.username, '测试')
})
