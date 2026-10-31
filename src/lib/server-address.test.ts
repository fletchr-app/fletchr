import { describe, expect, it } from 'vitest'

import { normaliseUrl, parseServerAddress } from './server-address'

describe('parseServerAddress', () => {
  it('adds https when there is no scheme', () => {
    expect(parseServerAddress('club.example.org')).toEqual({ url: 'https://club.example.org' })
  })
  it('drops trailing slashes and lower-cases the host', () => {
    expect(parseServerAddress('  HTTPS://Club.Example.org/// ')).toEqual({ url: 'https://club.example.org' })
  })
  it('keeps a port', () => {
    expect(parseServerAddress('club.example.org:8443')).toEqual({ url: 'https://club.example.org:8443' })
  })
  it('accepts IPv4 and IPv6 hosts', () => {
    expect(parseServerAddress('192.168.1.5:8080')).toEqual({ url: 'https://192.168.1.5:8080' })
    expect(parseServerAddress('https://[::1]:8000')).toEqual({ url: 'https://[::1]:8000' })
  })
  it('refuses empty input', () => {
    expect(parseServerAddress('   ')).toEqual({ error: 'empty' })
  })
  it('refuses other schemes', () => {
    expect(parseServerAddress('ftp://club.example.org')).toEqual({ error: 'scheme' })
  })
  it('refuses http unless allowed', () => {
    expect(parseServerAddress('http://club.example.org')).toEqual({ error: 'httpNotAllowed' })
    expect(parseServerAddress('http://localhost:8080', { allowHttp: true })).toEqual({ url: 'http://localhost:8080' })
  })
  it('refuses a path, query or fragment', () => {
    expect(parseServerAddress('https://club.example.org/api')).toEqual({ error: 'path' })
    expect(parseServerAddress('https://club.example.org?x=1')).toEqual({ error: 'path' })
    expect(parseServerAddress('https://club.example.org#x')).toEqual({ error: 'path' })
  })
  it('refuses nonsense', () => {
    expect(parseServerAddress('https://')).toEqual({ error: 'invalid' })
    expect(parseServerAddress('exa mple')).toEqual({ error: 'invalid' })
  })
})

describe('normaliseUrl', () => {
  it('trims and drops trailing slashes', () => {
    expect(normaliseUrl(' https://a.b// ')).toBe('https://a.b')
  })
})
