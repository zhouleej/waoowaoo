import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildMobileCloudSignature, mobileCloudPercentEncode } from '@/lib/mobile-cloud-maas/signature'

describe('Mobile Cloud BC-Signature V2.0', () => {
  it('uses the documented percent encoding rules', () => {
    expect(mobileCloudPercentEncode('a b+c*~')).toBe('a%20b%2Bc%2A~')
  })

  it('builds a deterministic HmacSHA1 signature and excludes Signature from canonical params', () => {
    const result = buildMobileCloudSignature({
      accessKey: 'ak-demo',
      secretKey: 'sk-demo',
      method: 'post',
      servletPath: '/api/openapi-maas/exp/aicc/v2/asset-group',
      query: { z: 'a b', a: '1', Signature: 'stale' },
      now: Date.parse('2026-08-09T00:00:00.000Z'),
      nonce: 'nonce-demo',
    })

    expect(result.params).toMatchObject({
      AccessKey: 'ak-demo',
      Timestamp: '2026-08-09T00:00:00.000Z',
      SignatureMethod: 'HmacSHA1',
      SignatureVersion: 'V2.0',
      SignatureNonce: 'nonce-demo',
    })
    expect(result.canonicalQueryString).toContain('z=a%20b')
    expect(result.canonicalQueryString).not.toContain('Signature=stale')

    const queryHash = createHash('sha256').update(result.canonicalQueryString, 'utf8').digest('hex')
    const stringToSign = `POST\n%2Fapi%2Fopenapi-maas%2Fexp%2Faicc%2Fv2%2Fasset-group\n${queryHash}`
    expect(result.stringToSign).toBe(stringToSign)
    expect(result.signature).toBe(createHmac('sha1', 'BC_SIGNATURE&sk-demo').update(stringToSign, 'utf8').digest('hex'))
    expect(result.params.Signature).toBe(result.signature)
  })
})
