import { log, types } from 'vortex-api';
import * as https from 'https';
import { BUTR_HOST, IModAnalyzerRequestQuery, IModAnalyzerResult } from '.';

export class ModAnalyzerProxy {
  private mAPI: types.IExtensionApi;
  private mOptions: https.RequestOptions;
  constructor(api: types.IExtensionApi) {
    this.mAPI = api;
    this.mOptions = {
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
      const req = https
        .request(this.mOptions, (res) => {
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
        })
        .on('error', (err) => reject(err));
      req.write(JSON.stringify(query));
      req.end();
    });
  }
}
