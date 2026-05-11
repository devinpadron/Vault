/*
 * Deployment instructions
 * -----------------------
 * Prerequisites:
 *   npm install -g aws-cdk
 *   aws configure  (or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION)
 *
 * First-time bootstrap (once per account/region):
 *   cd aws && npm ci
 *   npx cdk bootstrap
 *
 * Deploy:
 *   cd aws && npm ci
 *   npx cdk deploy
 *
 * The stack outputs ProxyUrl — set that as SCRYDEX_PROXY_URL in the app.
 * Set SCRYDEX_API_KEY in the Lambda env via the AWS console or:
 *   aws lambda update-function-configuration \
 *     --function-name pokevault-scrydex-proxy \
 *     --environment "Variables={SCRYDEX_API_KEY=<your-key>,DYNAMO_TABLE_NAME=pokevault-card-cache}"
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export class PokeVaultProxyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'CardCache', {
      tableName: 'pokevault-card-cache',
      partitionKey: { name: 'cacheKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const handler = new lambda.Function(this, 'ScrydexProxy', {
      functionName: 'pokevault-scrydex-proxy',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda'), {
        bundling: {
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          command: [
            'bash', '-c',
            'cp -r /asset-input/* /asset-output/ && cd /asset-output && npm ci --omit=dev 2>/dev/null || true',
          ],
          local: {
            tryBundle(outputDir: string) {
              // Skip local bundling — handler has no npm deps, copy as-is
              const { execSync } = require('child_process');
              execSync(`cp -r ${path.join(__dirname, '../lambda')}/. ${outputDir}`);
              return true;
            },
          },
        },
      }),
      environment: {
        DYNAMO_TABLE_NAME: table.tableName,
        SCRYDEX_API_KEY: process.env.SCRYDEX_API_KEY ?? '',
      },
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
    });

    table.grant(handler,
      'dynamodb:GetItem',
      'dynamodb:PutItem',
    );

    const httpApi = new apigatewayv2.HttpApi(this, 'ProxyApi', {
      apiName: 'pokevault-scrydex-proxy-api',
    });

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration('ProxyIntegration', handler),
    });

    new cdk.CfnOutput(this, 'ProxyUrl', {
      value: httpApi.apiEndpoint,
      description: 'Invoke URL for the Scrydex caching proxy',
    });
  }
}
