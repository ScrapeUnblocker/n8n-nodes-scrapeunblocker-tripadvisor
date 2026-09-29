import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { OptionField } from './GenericFunctions';
import { applyOptions, requireString, runActorAndGetItems } from './GenericFunctions';

// ScrapeUnblocker's public "TripAdvisor Scraper" Actor: https://apify.com/scrapeunblocker/tripadvisor-scraper
const ACTOR_ID = 'aiXzAenYnoLUvmmKM';
const INTEGRATION_APP_ID = 'scrapeunblocker-tripadvisor-scraper';

// Node option name -> Actor input key.
const OPTION_FIELDS: Record<string, OptionField> = {
	page: {
		key: 'page',
	},
	proxyCountry: {
		key: 'proxy_country',
		kind: 'upper',
	},
};

function buildActorInput(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	options: IDataObject,
	itemIndex: number,
): IDataObject {
	const input: IDataObject = {};

	switch (`${resource}:${operation}`) {
		case 'place:getAll': {
			input.url = requireString.call(this, 'url', 'List URL', itemIndex);
			input.max_results = this.getNodeParameter('maxResults', itemIndex);
			break;
		}
		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for resource "${resource}"`,
				{ itemIndex },
			);
	}

	applyOptions(input, options, OPTION_FIELDS);
	return input;
}

export class TripAdvisorScraper implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TripAdvisor Scraper',
		name: 'tripAdvisorScraper',
		icon: {
			light: 'file:tripAdvisorScraper.png',
			dark: 'file:tripAdvisorScraper.dark.png',
		},
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Get restaurants, hotels and attractions from TripAdvisor list pages with the ScrapeUnblocker Actor on Apify',
		defaults: {
			name: 'TripAdvisor Scraper',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'apifyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Place',
						value: 'place',
					},
				],
				default: 'place',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['place'],
					},
				},
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get the places of a TripAdvisor restaurants, hotels or attractions list',
						action: 'Get many places',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'List URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://www.tripadvisor.com/Restaurants-g60763-New_York_City_New_York.html',
				description:
					'A TripAdvisor Restaurants, Hotels or Attractions list URL, which contains a geo ID segment such as -g60763-, e.g. https://www.tripadvisor.com/Restaurants-g60763-New_York_City_New_York.html',
				displayOptions: {
					show: {
						resource: ['place'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 1020,
				},
				default: 30,
				description:
					'How many places to collect across pages (about 30 per page, 1-1020). TripAdvisor renders slowly, so large values take a while.',
				displayOptions: {
					show: {
						resource: ['place'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Proxy Country',
						name: 'proxyCountry',
						type: 'string',
						default: '',
						placeholder: 'US',
						description: 'Exit-IP country (ISO-2, e.g. US). Leave empty for automatic choice.',
					},
					{
						displayName: 'Start Page',
						name: 'page',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 34,
						},
						default: 1,
						description: 'Results page to start from (1-34)',
					},
					{
						displayName: 'Timeout (Seconds)',
						name: 'timeout',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description:
							'Maximum run time of the Apify Actor run. 0 keeps the Actor default. A run that times out fails the node.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const { timeout, ...actorOptions } = options;

				const input = buildActorInput.call(this, resource, operation, actorOptions, i);
				const { items: results } = await runActorAndGetItems.call(this, {
					actorId: ACTOR_ID,
					integrationAppId: INTEGRATION_APP_ID,
					input,
					itemIndex: i,
					timeoutSecs: (timeout as number) || undefined,
				});

				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors return an error of their own class unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
