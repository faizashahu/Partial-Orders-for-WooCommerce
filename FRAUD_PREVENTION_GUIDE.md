# Fraud Prevention System - Implementation Guide

## Overview
The Fraud Prevention System has been integrated into the Partial Orders for WooCommerce plugin. It uses the Nirvor API to check customer order history and require advance payment for high-risk customers.

## Features Implemented

### 1. Admin Settings Page
- Location: WordPress Admin > Fraud Prevention System
- Toggle to enable/disable fraud prevention
- API credentials configuration (API Key & API Secret)
- Minimum score threshold (percentage of successful deliveries)
- Minimum order count requirement
- Custom COD charge option (or use shipping fees)

### 2. Checkout Integration
When fraud prevention is enabled and a customer attempts COD checkout:

1. **API Check**: System calls Nirvor API with customer's billing phone number
2. **Score Calculation**: Calculates success rate = (delivered orders / total orders) × 100
3. **Validation**: Checks if customer meets:
   - Minimum order count
   - Minimum success score

### 3. Advance Payment Flow
If customer fails fraud checks:

1. Checkout is blocked with an error message
2. Modal popup appears requesting advance payment
3. Customer selects alternative payment method (excluding COD)
4. Payment amount is either:
   - Custom COD charge (if configured)
   - Shipping fees (default)
5. After successful payment, customer can complete COD order
6. Advance payment amount is deducted from final order total

### 4. Order Management
- Advance payment orders are tracked with metadata
- Final COD order includes "Advance Payment Credit" line item
- Order notes link advance payment to final order
- Session management ensures proper flow

## API Integration

### Endpoint
`https://nirvor.app/api/v1/search`

### Request Format
```json
{
  "phone": "01712345678"
}
```

### Headers
- `Content-Type: application/json`
- `X-API-Key: your_api_key`
- `X-API-Secret: your_api_secret`

### Response Format
```json
{
  "success": true,
  "overall": {
    "total_parcels": 124,
    "delivered": 122,
    "returned": 2
  }
}
```

## Configuration Examples

### Example 1: Strict Validation
- Minimum Score: 80%
- Minimum Orders: 5
- Custom COD Charge: 100 (fixed amount)

Result: Only customers with 5+ orders and 80%+ success rate can use COD without advance payment.

### Example 2: Lenient Validation
- Minimum Score: 50%
- Minimum Orders: 1
- Custom COD Charge: (empty - uses shipping fees)

Result: Customers need at least 1 order with 50%+ success rate. Failed customers pay shipping fees in advance.

## User Experience Flow

### Successful Customer (Passes Fraud Check)
1. Fills checkout form
2. Selects COD payment
3. Places order normally
4. Order is created with COD

### High-Risk Customer (Fails Fraud Check)
1. Fills checkout form
2. Selects COD payment
3. Attempts to place order
4. Modal appears: "Advance Payment Required"
5. Selects payment method (e.g., credit card)
6. Pays advance amount
7. Returns to checkout
8. Places order with COD
9. Final order total = Original Total - Advance Payment

## Technical Implementation

### PHP Files
- `wc-partial-orders.php`: Main plugin file with all backend logic
  - Admin menu registration
  - Settings page rendering
  - API integration
  - Checkout validation
  - Order adjustment logic

### JavaScript Files
- `js/partial-orders.js`: Frontend checkout logic
  - Fraud check before order placement
  - Modal UI for advance payment
  - Payment method switching
  - Session management

### Key Functions

#### Backend (PHP)
- `add_admin_menu()`: Registers admin menu
- `render_admin_page()`: Displays settings form
- `check_fraud_prevention()`: AJAX handler for fraud API check
- `validate_checkout_fraud()`: Validates checkout before order creation
- `check_advance_payment_completion()`: Tracks successful advance payments
- `check_and_apply_advance_payment()`: Applies credit to final order

#### Frontend (JavaScript)
- `checkFraudPrevention()`: Calls API before checkout
- `showAdvancePaymentModal()`: Displays payment modal
- Checkout event handlers for payment flow

## Security Considerations

1. **Nonce Verification**: All AJAX requests use WordPress nonces
2. **Input Sanitization**: Phone numbers and settings are sanitized
3. **Capability Checks**: Admin settings require `manage_woocommerce` capability
4. **Graceful Failures**: API errors don't block legitimate customers
5. **Session Management**: Prevents replay attacks

## Testing Checklist

- [ ] Enable fraud prevention in admin settings
- [ ] Configure API credentials
- [ ] Set minimum score and order thresholds
- [ ] Test with customer phone number that passes checks
- [ ] Test with customer phone number that fails checks
- [ ] Verify advance payment modal appears
- [ ] Complete advance payment with alternative method
- [ ] Verify advance payment is recorded
- [ ] Complete COD order after advance payment
- [ ] Verify advance payment credit appears on final order
- [ ] Check order notes for proper linking

## Troubleshooting

### Issue: Fraud check always passes
- Check if fraud prevention is enabled in settings
- Verify API key and secret are correct
- Check browser console for JavaScript errors

### Issue: Modal doesn't appear
- Ensure JavaScript file is loaded (check browser console)
- Verify payment methods other than COD are available
- Check for JavaScript conflicts with theme

### Issue: Advance payment not deducted
- Check WooCommerce session is working
- Verify `woocommerce_thankyou` hook is firing
- Check for plugin conflicts

## Future Enhancements

Potential improvements:
1. Manual whitelist/blacklist of phone numbers
2. Email notifications for flagged orders
3. Analytics dashboard for fraud prevention metrics
4. Support for multiple courier API integrations
5. Customizable modal design and messaging
6. Grace period for first-time customers
