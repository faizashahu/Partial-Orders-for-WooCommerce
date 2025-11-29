jQuery(function ($) {
    // Ensure this script only runs on the checkout page
    if (!$('form.checkout').length) return;

    let timer = null;
    let orderKey = localStorage.getItem('partial_order_key') || '';
    let isProcessing = false;

    /**
     * Function to collect form data
     * @returns {FormData} - The form data to be sent to the server
     */
    function collectFormData() {
        const formData = new FormData($('form.checkout')[0]);
        formData.append('action', 'save_partial_order');
        formData.append('nonce', wcPartialOrders.nonce);

        if (orderKey) {
            formData.append('order_key', orderKey);
        }

        return formData;
    }

    /**
     * Function to send form data to the server via AJAX
     * @param {FormData} formData - The data to be sent to the server
     */
    function saveFormData(formData) {
        if (isProcessing) return;
        
        isProcessing = true;
        
        $.ajax({
            url: wcPartialOrders.ajax_url,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                if (response.success) {
                    // Save the order key in localStorage
                    orderKey = response.data.order_key;
                    localStorage.setItem('partial_order_key', orderKey);
                    console.log('Partial order updated successfully');
                } else {
                    console.error('Failed to save partial order:', response.data);
                }
            },
            error: function (xhr, status, error) {
                console.error('Error saving partial order:', error);
            },
            complete: function() {
                isProcessing = false;
            }
        });
    }

    /**
     * Function to determine if the form has data to save
     * @returns {boolean} - True if there is data to save, otherwise false
     */
    function hasRelevantData() {
        const requiredFields = [
            'billing_first_name',
            'billing_last_name',
            'billing_email',
            'billing_address_1',
        ];

        let hasData = false;
        for (let field of requiredFields) {
            if ($(`[name="${field}"]`).val()) {
                hasData = true;
                break;
            }
        }

        return hasData && WC_CHECKOUT_DATA_CHANGED;
    }

    let WC_CHECKOUT_DATA_CHANGED = false;

    /**
     * Event listener for field changes
     * Saves partial order data when any field is updated
     */
    $('form.checkout').on('change keyup', 'input, select, textarea', function () {
        WC_CHECKOUT_DATA_CHANGED = true;
        
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (hasRelevantData()) {
                const formData = collectFormData();
                saveFormData(formData);
                WC_CHECKOUT_DATA_CHANGED = false;
            }
        }, 1500);
    });

    /**
     * Event listener for cart update events
     */
    $(document.body).on('updated_cart_totals updated_checkout', function() {
        WC_CHECKOUT_DATA_CHANGED = true;
        
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (hasRelevantData()) {
                const formData = collectFormData();
                saveFormData(formData);
                WC_CHECKOUT_DATA_CHANGED = false;
            }
        }, 1500);
    });

    /**
     * Save partial order data on page load if the form already has data
     */
    $(document).ready(function () {
        if (hasRelevantData()) {
            const formData = collectFormData();
            saveFormData(formData);
        }
    });

    /**
     * Event listener for before the user leaves the page
     * Ensures partial data is saved before leaving
     */
    $(window).on('beforeunload', function () {
        if (hasRelevantData()) {
            const formData = collectFormData();
            navigator.sendBeacon(wcPartialOrders.ajax_url, formData);
        }
    });

    /**
     * Event listener for WooCommerce events
     * Handles clearing of local storage on successful order creation
     */
    $(document.body)
        .on('checkout_error', function () {
            // Keep partial data on checkout errors
            console.log('Checkout error occurred, partial order data retained.');
        })
        .on('checkout_place_order_success', function () {
            // Clear partial data on successful order placement
            localStorage.removeItem('partial_order_key');
            console.log('Order completed, partial order data cleared.');
        });

    let fraudCheckInProgress = false;
    let fraudCheckPassed = false;
    let fraudCheckData = null;

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('#place_order, button.wc-block-components-checkout-place-order-button');

        if (!btn) {
            return;
        }

        const paymentMethod = $('input[name="payment_method"]:checked').val() ||
                             document.querySelector('input[name="radio-control-wc-payment-method-options"]:checked')?.value;

        if (paymentMethod !== 'cod') {
            console.log('%c[Fraud Prevention] Payment method is not COD, allowing order', 'color: #00a0d2; font-weight: bold;');
            return;
        }

        if (fraudCheckPassed) {
            console.log('%c[Fraud Prevention] Check already passed, allowing order', 'color: #46b450; font-weight: bold;');
            return;
        }

        if (fraudCheckInProgress) {
            e.preventDefault();
            e.stopImmediatePropagation();
            console.log('%c[Fraud Prevention] Check in progress, blocking order', 'color: #f56e28; font-weight: bold;');
            return;
        }

        const billingPhone = $('input[name="billing_phone"]').val() ||
                            document.querySelector('input[id*="billing-phone"], input[type="tel"]')?.value ||
                            '';

        if (!billingPhone) {
            console.log('%c[Fraud Prevention] No billing phone found, allowing order', 'color: #00a0d2; font-weight: bold;');
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();

        console.log('%c[Fraud Prevention] Starting fraud check...', 'color: #00a0d2; font-weight: bold;');
        console.log('Phone number:', billingPhone);

        fraudCheckInProgress = true;

        $.ajax({
            url: wcPartialOrders.ajax_url,
            type: 'POST',
            data: {
                action: 'check_fraud_prevention',
                nonce: wcPartialOrders.fraud_nonce,
                phone: billingPhone
            },
            success: function(response) {
                if (response.success && response.data) {
                    fraudCheckData = response.data;

                    if (response.data.reason) {
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        console.log('%c[Fraud Prevention] Check Bypassed', 'color: #f56e28; font-weight: bold; font-size: 14px;');
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        console.log('%cReason:', 'font-weight: bold;', response.data.reason);
                        console.log('%c✓ Order Allowed', 'color: #46b450; font-weight: bold; font-size: 16px; background: #ecf7ed; padding: 5px 10px;');
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        fraudCheckPassed = true;
                        btn.click();
                        return;
                    }

                    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                    console.log('%c[Fraud Prevention] API Response Received', 'color: #0073aa; font-weight: bold; font-size: 14px;');
                    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                    console.log('%cPhone Number:', 'font-weight: bold;', response.data.phone || 'N/A');
                    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                    console.log('%cDelivery Statistics:', 'color: #0073aa; font-weight: bold;');
                    console.log('%cTotal Deliveries:', 'font-weight: bold;', response.data.total_parcels);
                    console.log('%cSuccessful Deliveries:', 'font-weight: bold;', response.data.delivered);
                    console.log('%cCancelled/Returned:', 'font-weight: bold;', (response.data.returned || (response.data.total_parcels - response.data.delivered)));
                    console.log('%cSuccess Score:', 'font-weight: bold;', response.data.score + '%');
                    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                    console.log('%cRequired Thresholds:', 'color: #0073aa; font-weight: bold;');
                    console.log('%cMinimum Orders:', 'font-weight: bold;', response.data.minimum_orders);
                    console.log('%cMinimum Score:', 'font-weight: bold;', response.data.minimum_score + '%');
                    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                    console.log('%cValidation Results:', 'color: #0073aa; font-weight: bold;');

                    const ordersPassed = response.data.total_parcels >= response.data.minimum_orders;
                    const scorePassed = response.data.score >= response.data.minimum_score;

                    console.log('%cMinimum Orders Check:', 'font-weight: bold;',
                        ordersPassed ? '✓ PASSED' : '✗ FAILED',
                        ordersPassed ? '(color: #46b450)' : '(color: #dc3232)'
                    );
                    console.log('%c  → Required: ' + response.data.minimum_orders + ' | Actual: ' + response.data.total_parcels,
                        'font-style: italic; color: #666;'
                    );

                    console.log('%cMinimum Score Check:', 'font-weight: bold;',
                        scorePassed ? '✓ PASSED' : '✗ FAILED',
                        scorePassed ? '(color: #46b450)' : '(color: #dc3232)'
                    );
                    console.log('%c  → Required: ' + response.data.minimum_score + '% | Actual: ' + response.data.score + '%',
                        'font-style: italic; color: #666;'
                    );
                    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');

                    if (response.data.passed) {
                        console.log('%c✓ FRAUD CHECK PASSED - Order Allowed', 'color: #46b450; font-weight: bold; font-size: 16px; background: #ecf7ed; padding: 5px 10px;');
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        fraudCheckPassed = true;
                        btn.click();
                    } else {
                        console.log('%c✗ FRAUD CHECK FAILED - Order Blocked', 'color: #dc3232; font-weight: bold; font-size: 16px; background: #f9e2e2; padding: 5px 10px;');
                        console.log('%cAdvance payment required to proceed', 'color: #f56e28; font-style: italic;');
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        showAdvancePaymentModal(response.data);
                    }
                } else {
                    console.log('%c[Fraud Prevention] API check disabled or failed, allowing order', 'color: #f56e28; font-weight: bold;');
                    fraudCheckPassed = true;
                    btn.click();
                }
            },
            error: function(xhr, status, error) {
                console.log('%c[Fraud Prevention] API error occurred, allowing order', 'color: #dc3232; font-weight: bold;');
                console.error('Error details:', error);
                fraudCheckPassed = true;
                btn.click();
            },
            complete: function() {
                fraudCheckInProgress = false;
            }
        });
    }, true);

    function showAdvancePaymentModal(checkData) {
        if ($('#fps-payment-modal').length) {
            $('#fps-payment-modal').show();
            return;
        }

        checkData = checkData || fraudCheckData || {};

        const shippingTotal = parseFloat($('.shipping .woocommerce-Price-amount').text().replace(/[^0-9.]/g, '')) || 0;
        const customCharge = wcPartialOrders.custom_cod_charge;
        const chargeAmount = customCharge ? parseFloat(customCharge) : shippingTotal;

        const currencySymbol = $('.woocommerce-Price-currencySymbol').first().text() || '';

        const availableGateways = [];
        $('.wc_payment_methods .wc_payment_method').each(function() {
            const input = $(this).find('input.input-radio');
            const label = $(this).find('label').text().trim();
            const value = input.val();

            if (value !== 'cod') {
                availableGateways.push({
                    value: value,
                    label: label
                });
            }
        });

        let gatewayOptions = '';
        availableGateways.forEach(function(gateway) {
            gatewayOptions += `<option value="${gateway.value}">${gateway.label}</option>`;
        });

        let checkDetailsHTML = '';
        if (checkData && checkData.total_parcels !== undefined) {
            checkDetailsHTML = `
                <div style="background:#fff3cd; border-left:4px solid #f56e28; padding:12px 15px; margin-bottom:20px; border-radius:4px;">
                    <p style="margin:0 0 8px 0; font-size:13px; color:#856404; font-weight:600;">Verification Results:</p>
                    <p style="margin:0; font-size:12px; color:#856404; line-height:1.6;">
                        Total Orders: <strong>${checkData.total_parcels}</strong> |
                        Successful: <strong>${checkData.delivered}</strong> |
                        Success Rate: <strong>${checkData.score}%</strong>
                    </p>
                    <p style="margin:8px 0 0 0; font-size:12px; color:#856404;">
                        Required: <strong>${checkData.minimum_orders}+ orders</strong> with <strong>${checkData.minimum_score}%+ success rate</strong>
                    </p>
                </div>
            `;
        }

        const modalHTML = `
            <div id="fps-payment-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999;">
                <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:white; padding:30px; border-radius:8px; max-width:500px; width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                    <h2 style="margin-top:0; color:#333;">Advance Payment Required</h2>

                    ${checkDetailsHTML}

                    <p style="color:#666;">Please pay the delivery charges in advance to proceed with your order.</p>
                    <p style="font-size:18px; font-weight:bold; color:#0073aa;">Amount to pay: ${currencySymbol}${chargeAmount.toFixed(2)}</p>

                    <div style="margin:20px 0;">
                        <label for="fps-payment-method" style="display:block; margin-bottom:10px; font-weight:600;">Select Payment Method:</label>
                        <select id="fps-payment-method" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:14px;">
                            ${gatewayOptions}
                        </select>
                    </div>

                    <div style="background:#f9f9f9; padding:15px; border-radius:4px; margin-bottom:20px;">
                        <p style="margin:0; font-size:13px; color:#666;">
                            <strong>Note:</strong> After successful payment of the delivery charge, you will be able to complete your order. The advance payment will be deducted from your order total.
                        </p>
                    </div>

                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button id="fps-proceed-payment" style="flex:1; padding:12px 20px; background:#0073aa; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; transition:background 0.3s;">Proceed to Payment</button>
                        <button id="fps-cancel-payment" style="flex:1; padding:12px 20px; background:#ddd; color:#333; border:none; border-radius:4px; cursor:pointer; font-weight:600; transition:background 0.3s;">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        $('body').append(modalHTML);

        $('#fps-proceed-payment').on('mouseenter', function() {
            $(this).css('background', '#005177');
        }).on('mouseleave', function() {
            $(this).css('background', '#0073aa');
        });

        $('#fps-cancel-payment').on('mouseenter', function() {
            $(this).css('background', '#ccc');
        }).on('mouseleave', function() {
            $(this).css('background', '#ddd');
        });

        $('#fps-cancel-payment').on('click', function() {
            $('#fps-payment-modal').hide();
        });

        $('#fps-proceed-payment').on('click', function() {
            const selectedGateway = $('#fps-payment-method').val();

            const originalPaymentMethod = $('input[name="payment_method"]:checked').val();

            $('input[name="payment_method"][value="' + selectedGateway + '"]').prop('checked', true).trigger('change');

            $('#fps-payment-modal').hide();

            fraudCheckPassed = true;

            $('form.checkout').one('checkout_place_order_success', function(event, result) {
                if (result && result.result === 'success') {
                    $('input[name="payment_method"][value="' + originalPaymentMethod + '"]').prop('checked', true);
                }
            });

            $('form.checkout').submit();
        });
    }
});