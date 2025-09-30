#!/usr/bin/env node

// Analyze the payment flow by decoding a payment header from the logs
const paymentHeader = process.argv[2];

try {
  const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
  console.log('🔍 Decoded X-PAYMENT header:');
  console.log(JSON.stringify(decoded, null, 2));

  if (decoded.payload?.authorization) {
    const auth = decoded.payload.authorization;
    console.log('\n📊 Payment Analysis:');
    console.log('- From:', auth.from);
    console.log('- To:', auth.to);
    console.log('- Value:', auth.value, `($${(parseInt(auth.value) / 1000000).toFixed(3)} USDC)`);
    console.log('- Valid After:', new Date(parseInt(auth.validAfter) * 1000).toISOString());
    console.log('- Valid Before:', new Date(parseInt(auth.validBefore) * 1000).toISOString());
    console.log('- Duration:', `${parseInt(auth.validBefore) - parseInt(auth.validAfter)} seconds`);
    console.log('- Nonce:', auth.nonce);
  }
} catch (e) {
  console.error('Failed to decode payment header:', e);
  console.error('Header provided:', paymentHeader);
}
