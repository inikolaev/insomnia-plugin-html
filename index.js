const jsdom = require('jsdom');
const { JSDOM } = jsdom;

module.exports.templateTags = [{
  name: 'html',
  displayName: 'HTML',
  description: 'extract values from HTML',
  args: [{
    displayName: 'Value Type',
    type: 'enum',
    options: [{
      displayName: 'Tag Attribute',
      description: 'value of the tag attribute',
      value: 'attribute',
    }, {
      displayName: 'Tag Value',
      description: 'contents of the tag',
      value: 'value',
    }],
  }, {
    type: 'string',
    hide: args => args[0].value !== 'attribute',
    displayName: 'Attribute Name'
  }, {
    displayName: 'Request',
    type: 'model',
    model: 'Request'
  }, {
    type: 'string',
    encoding: 'base64',
    displayName: 'XPath Expression'
  }, {
    displayName: 'Trigger Behavior',
    help: 'Configure when to resend the dependent request',
    type: 'enum',
    options: [
      {
        displayName: 'Never',
        description: 'never resend request',
        value: 'never',
      },
      {
        displayName: 'No History',
        description: 'resend when no responses present',
        value: 'no-history',
      },
      {
        displayName: 'Always',
        description: 'resend request when needed',
        value: 'always',
      },
    ],
  }],
  async run (context, valueType, attribute, id, filter, resendBehavior) {
    resendBehavior = (resendBehavior || 'never').toLowerCase();

    if (!id) {
      throw new Error('No request specified');
    }

    const request = await context.util.models.request.getById(id);
    if (!request) {
      throw new Error(`Could not find request ${id}`);
    }

    let response = await context.util.models.response.getLatestForRequestId(id);

    let shouldResend = false;
    if (context.context.getExtraInfo('fromHtmlTag')) {
      shouldResend = false;
    } else if (resendBehavior === 'never') {
      shouldResend = false;
    } else if (resendBehavior === 'no-history') {
      shouldResend = !response;
    } else if (resendBehavior === 'always') {
      shouldResend = true;
    }

    // Make sure we only send the request once per render so we don't have infinite recursion
    const fromResponseTag = context.context.getExtraInfo('fromHtmlTag');
    if (fromResponseTag) {
      console.log('[response tag] Preventing recursive render');
      shouldResend = false;
    }

    if (shouldResend && context.renderPurpose === 'send') {
      console.log('[response tag] Resending dependency');
      response = await context.network.sendRequest(request, [
        { name: 'fromHtmlTag', value: true },
      ]);
    }

    if (!response) {
      console.log('[response tag] No response found');
      throw new Error('No responses for request');
    }

    if (response.error) {
      console.log('[response tag] Response error ' + response.error);
      throw new Error('Failed to send dependent request ' + response.error);
    }

    if (!response.statusCode) {
      console.log('[response tag] Invalid status code ' + response.statusCode);
      throw new Error('No successful responses for request');
    }

    const sanitizedFilter = filter.trim();

    const bodyBuffer = context.util.models.response.getBodyBuffer(response, '');
    const match = response.contentType.match(/charset=([\w-]+)/);
    const charset = match && match.length >= 2 ? match[1] : 'utf-8';

    // Sometimes iconv conversion fails so fallback to regular buffer
    let body;
    try {
      body = iconv.decode(bodyBuffer, charset);
    } catch (err) {
      body = bodyBuffer.toString();
      console.warn('[response] Failed to decode body', err);
    }

    const dom = new JSDOM(body);
    const element = dom.window.document.querySelector(sanitizedFilter);

    if (valueType === "attribute") {
      return element.getAttribute(attribute);
    } else {
      return element.textContent;
    }
  }
}];
