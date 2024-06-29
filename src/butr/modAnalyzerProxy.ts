import { log } from 'vortex-api';
import { request, RequestOptions } from 'https';
import { BUTR_HOST } from './const';
import { IModAnalyzerRequestQuery, IModAnalyzerResult } from './types';

export class ModAnalyzerProxy {
  private options: RequestOptions;
  constructor() {
    this.options = {
      host: BUTR_HOST,
      method: 'POST',
      protocol: 'https:',
      path: '/api/v1/ModsAnalyzer/GetCompatibilityScore',
      headers: {
        Tenant: '1', // Bannerlord
        'Content-Type': 'application/json',
      },
    };
  }

  public async analyze(query: IModAnalyzerRequestQuery): Promise<IModAnalyzerResult> {
    return new Promise((resolve, reject) => {
      const req = request(this.options, (res) => {
        let body = Buffer.from([]);
        res
          .on('error', (err) => reject(err))
          .on('data', (chunk) => {
            body = Buffer.concat([body, chunk]);
          })
          .on('end', () => {
            const textual = body.toString('utf8');
            try {
              const parsed = JSON.parse(textual);
              resolve(parsed);
            } catch (err) {
              log('error', 'failed to parse butr mod analyzer response', textual);
              reject(err);
            }
          });
      }).on('error', (err) => reject(err));
      req.write(JSON.stringify(query));
      req.end();
    });
  }
}
