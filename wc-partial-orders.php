<?php
/**
 * Plugin Name: Partial Orders for WooCommerce
 * Plugin URI: https://wordpress.org/plugins/partial-orders-for-woocommerce
 * Description: Tracks and manages incomplete orders during checkout.
 * Version: 1.0.2
 * Author: Shahriar Rahman
 * Author URI: https://github.com/mrbla4ck
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: partial-orders-for-woocommerce
 * Domain Path: /languages
 * Requires at least: 5.0
 * Requires PHP: 7.2
 * WC requires at least: 4.0
 * Tested up to: 6.7
 */

defined('ABSPATH') || exit;

// Check if WooCommerce is active
if (!in_array('woocommerce/woocommerce.php', apply_filters('active_plugins', get_option('active_plugins')))) {
    return;
}

/**
 * Class WC_Partial_Orders
 * 
 * Handles partial order functionality for WooCommerce checkout.
 */
class WC_Partial_Orders {
    /**
     * Singleton instance
     *
     * @var WC_Partial_Orders|null
     */
    private static $instance = null;

    /**
     * Get singleton instance
     *
     * @return WC_Partial_Orders
     */
    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    public function __construct() {
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);

        add_action('init', [$this, 'init']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('wp_ajax_save_partial_order', [$this, 'save_partial_order']);
        add_action('wp_ajax_nopriv_save_partial_order', [$this, 'save_partial_order']);
        add_action('woocommerce_checkout_order_processed', [$this, 'cleanup_partial_order'], 10, 1);
        add_action('before_delete_post', [$this, 'cleanup_partial_order_on_delete'], 10, 1);

        // Orders page integration
        add_filter('wc_order_statuses', [$this, 'add_order_status']);
        add_filter('manage_edit-shop_order_columns', [$this, 'add_order_columns']);
        add_action('manage_shop_order_posts_custom_column', [$this, 'order_column_content'], 10, 2);
        add_filter('woocommerce_admin_order_actions', [$this, 'add_admin_order_actions'], 10, 2);

        // Admin menu and settings
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);

        // Fraud prevention
        add_action('wp_ajax_check_fraud_prevention', [$this, 'check_fraud_prevention']);
        add_action('wp_ajax_nopriv_check_fraud_prevention', [$this, 'check_fraud_prevention']);
        add_action('woocommerce_after_checkout_validation', [$this, 'validate_checkout_fraud'], 10, 2);
        add_action('woocommerce_thankyou', [$this, 'check_advance_payment_completion'], 5, 1);
        add_action('woocommerce_checkout_create_order', [$this, 'check_and_apply_advance_payment'], 10, 2);
    }

    /**
     * Plugin activation hook
     */
    public function activate() {
        $this->create_tables();
        $this->register_order_status();
        flush_rewrite_rules();
    }

    /**
     * Plugin deactivation hook
     */
    public function deactivate() {
        flush_rewrite_rules();
    }

    /**
     * Initialize plugin
     */
    public function init() {
        $this->register_order_status();
        load_plugin_textdomain('partial-orders-for-woocommerce', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }

    /**
     * Create custom tables for partial orders
     */
    private function create_tables() {
        global $wpdb;
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        
        $this->create_partial_orders_table($wpdb);
        $this->create_partial_order_items_table($wpdb);
    }

    /**
     * Create partial orders table
     *
     * @param wpdb $wpdb WordPress database object
     */
    private function create_partial_orders_table($wpdb) {
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'partial_orders';
        
        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id BIGINT(20) NOT NULL AUTO_INCREMENT,
            order_id BIGINT(20) NOT NULL,
            user_id BIGINT(20),
            session_id VARCHAR(255),
            order_key VARCHAR(100) UNIQUE,
            billing_first_name VARCHAR(100),
            billing_last_name VARCHAR(100),
            billing_address_1 TEXT,
            billing_address_2 TEXT,
            billing_city VARCHAR(100),
            billing_state VARCHAR(100),
            billing_postcode VARCHAR(20),
            billing_country VARCHAR(2),
            billing_email VARCHAR(200),
            billing_phone VARCHAR(20),
            shipping_first_name VARCHAR(100),
            shipping_last_name VARCHAR(100),
            shipping_address_1 TEXT,
            shipping_address_2 TEXT,
            shipping_city VARCHAR(100),
            shipping_state VARCHAR(100),
            shipping_postcode VARCHAR(20),
            shipping_country VARCHAR(2),
            cart_hash VARCHAR(100),
            cart_data LONGTEXT,
            order_comments TEXT,
            order_total DECIMAL(10, 2),
            currency VARCHAR(3),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_modified DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY order_id (order_id),
            KEY user_session (user_id, session_id)
        ) $charset_collate";

        dbDelta($sql);
    }

    /**
     * Create partial order items table
     *
     * @param wpdb $wpdb WordPress database object
     */
    private function create_partial_order_items_table($wpdb) {
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'partial_order_items';
        
        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id BIGINT(20) NOT NULL AUTO_INCREMENT,
            partial_order_id BIGINT(20),
            product_id BIGINT(20),
            variation_id BIGINT(20),
            product_name VARCHAR(255),
            quantity INT,
            line_total DECIMAL(10, 2),
            product_data LONGTEXT,
            variation_data LONGTEXT,
            PRIMARY KEY (id),
            KEY partial_order_id (partial_order_id),
            KEY product_id (product_id)
        ) $charset_collate";

        dbDelta($sql);
    }

    /**
     * Register partial order status
     */
    private function register_order_status() {
        register_post_status('wc-partial', [
            'label' => _x('Partial Order', 'Order status', 'partial-orders-for-woocommerce'),
            'public' => true,
            'show_in_admin_status_list' => true,
            'show_in_admin_all_list' => true,
            'exclude_from_search' => false,
            /* translators: %s: number of orders */
            'label_count' => _n_noop(
                'Partial Order <span class="count">(%s)</span>',
                'Partial Orders <span class="count">(%s)</span>',
                'partial-orders-for-woocommerce'
            )
        ]);
    }

    /**
     * Add partial order status to WooCommerce order statuses
     *
     * @param array $order_statuses Existing order statuses
     * @return array Modified order statuses
     */
    public function add_order_status($order_statuses) {
        $new_statuses = [];
        foreach ($order_statuses as $key => $status) {
            $new_statuses[$key] = $status;
            if ($key === 'wc-pending') {
                $new_statuses['wc-partial'] = _x('Partial Order', 'Order status', 'partial-orders-for-woocommerce');
            }
        }
        return $new_statuses;
    }

    /**
     * Enqueue scripts and styles
     */
    public function enqueue_scripts() {
        if (!is_checkout()) {
            return;
        }

        wp_enqueue_script(
            'wc-partial-orders',
            plugins_url('js/partial-orders.js', __FILE__),
            ['jquery'],
            '1.0.2',
            true
        );

        wp_localize_script('wc-partial-orders', 'wcPartialOrders', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('save_partial_order'),
            'fraud_nonce' => wp_create_nonce('wc_fraud_check'),
            'custom_cod_charge' => get_option('fps_custom_cod_charge', '')
        ]);
    }

    /**
     * Get existing order by key
     *
     * @param string $order_key Order key
     * @return WC_Order|null Order object if found
     */
    private function get_existing_order_by_key($order_key) {
        global $wpdb;
        
        $partial_order = $wpdb->get_row($wpdb->prepare(
            "SELECT order_id FROM {$wpdb->prefix}partial_orders WHERE order_key = %s",
            $order_key
        ));

        if ($partial_order && $partial_order->order_id) {
            $order = wc_get_order($partial_order->order_id);
            if ($order) {
                return $order;
            }
        }

        return null;
    }

    /**
     * Save partial order
     */
    public function save_partial_order() {
        check_ajax_referer('save_partial_order', 'nonce');
    
        global $wpdb;
    
        $user_id = get_current_user_id();
        $session_id = WC()->session->get_customer_id();
        $order_key = isset($_POST['order_key']) ? wp_unslash(sanitize_text_field($_POST['order_key'])) : 'po_' . wp_generate_password(12, false);
    
        // Try to get existing order
        $order = $this->get_existing_order_by_key($order_key);
        
        if (!$order) {
            // Create a new WooCommerce order
            $order = wc_create_order();
            $order->update_meta_data('_partial_order_key', $order_key);
            $order->set_status('wc-partial');
            $order->save();
        }
    
        // Prepare order data
        $order_data = [
            'order_id' => $order->get_id(),
            'user_id' => $user_id ?: 0,
            'session_id' => $session_id,
            'order_key' => $order_key
        ];
    
        // Add billing details
        $billing_fields = [
            'billing_first_name', 'billing_last_name', 'billing_address_1', 'billing_address_2',
            'billing_city', 'billing_state', 'billing_postcode', 'billing_country',
            'billing_email', 'billing_phone'
        ];
    
        foreach ($billing_fields as $field) {
            if (isset($_POST[$field])) {
                $value = wp_unslash(sanitize_text_field($_POST[$field]));
                $meta_key = str_replace('billing_', '', $field);
                $order->update_meta_data("_billing_$meta_key", $value);
                $order_data[$field] = $value;
            }
        }
    
        // Add shipping details
        $shipping_fields = [
            'shipping_first_name', 'shipping_last_name', 'shipping_address_1', 'shipping_address_2',
            'shipping_city', 'shipping_state', 'shipping_postcode', 'shipping_country'
        ];
    
        foreach ($shipping_fields as $field) {
            if (isset($_POST[$field])) {
                $value = wp_unslash(sanitize_text_field($_POST[$field]));
                $meta_key = str_replace('shipping_', '', $field);
                $order->update_meta_data("_shipping_$meta_key", $value);
                $order_data[$field] = $value;
            }
        }
    
        // Handle cart items
        $cart = WC()->cart;
        if ($cart && !$cart->is_empty()) {
            // Remove existing items
            foreach ($order->get_items() as $item_id => $item) {
                $order->remove_item($item_id);
            }
    
            // Add current cart items
            foreach ($cart->get_cart() as $cart_item_key => $cart_item) {
                $product = $cart_item['data'];
                $product_id = $cart_item['product_id'];
                $variation_id = isset($cart_item['variation_id']) ? $cart_item['variation_id'] : 0;
                $quantity = $cart_item['quantity'];
    
                $item = new WC_Order_Item_Product();
                $item->set_props([
                    'product_id' => $product_id,
                    'variation_id' => $variation_id,
                    'quantity' => $quantity,
                    'subtotal' => $cart_item['line_subtotal'],
                    'total' => $cart_item['line_total'],
                ]);
                
                if ($product) {
                    $item->set_name($product->get_name());
                }
    
                $order->add_item($item);
            }
            
            $order_data['cart_hash'] = $cart->get_cart_hash();
            $order_data['cart_data'] = wp_json_encode($cart->get_cart());
            $order_data['order_total'] = $cart->get_total('');
            $order_data['currency'] = get_woocommerce_currency();
        }
    
        // Save order comments
        if (isset($_POST['order_comments'])) {
            $comments = wp_unslash(sanitize_textarea_field($_POST['order_comments']));
            $order->set_customer_note($comments);
            $order_data['order_comments'] = $comments;
        }
    
        $order->save();
    
        // Update partial_orders table
        $partial_orders_table = $wpdb->prefix . 'partial_orders';
        
        $existing_partial = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}partial_orders WHERE order_key = %s",
            $order_key
        ));
    
        if ($existing_partial) {
            $wpdb->update(
                $partial_orders_table,
                $order_data,
                ['id' => $existing_partial->id]
            );
            $partial_order_id = $existing_partial->id;
        } else {
            $wpdb->insert($partial_orders_table, $order_data);
            $partial_order_id = $wpdb->insert_id;
        }
    
        // Update partial_order_items table
        if ($cart && !$cart->is_empty() && $partial_order_id) {
            $items_table = $wpdb->prefix . 'partial_order_items';
            
            // Clear existing items
            $wpdb->delete($items_table, ['partial_order_id' => $partial_order_id]);
            
            // Add current items
            foreach ($cart->get_cart() as $cart_item) {
                $wpdb->insert($items_table, [
                    'partial_order_id' => $partial_order_id,
                    'product_id' => $cart_item['product_id'],
                    'variation_id' => isset($cart_item['variation_id']) ? $cart_item['variation_id'] : 0,
                    'product_name' => $cart_item['data']->get_name(),
                    'quantity' => $cart_item['quantity'],
                    'line_total' => $cart_item['line_total'],
                    'product_data' => wp_json_encode($cart_item['data']->get_data()),
                    'variation_data' => isset($cart_item['variation']) ? wp_json_encode($cart_item['variation']) : null
                ]);
            }
        }
    
        wp_send_json_success([
            'order_id' => $order->get_id(),
            'order_key' => $order_key
        ]);
    }

    /**
     * Cleanup partial order after successful checkout
     *
     * @param int $order_id Order ID
     */
    public function cleanup_partial_order($order_id) {
        global $wpdb;
        
        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }
        
        $partial_order_key = $order->get_meta('_partial_order_key');
        
        if ($partial_order_key) {
            // Delete from partial_orders and related items
            $partial_order = $wpdb->get_row($wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}partial_orders WHERE order_key = %s",
                $partial_order_key
            ));
            
            if ($partial_order) {
                $wpdb->delete($wpdb->prefix . 'partial_order_items', ['partial_order_id' => $partial_order->id]);
                $wpdb->delete($wpdb->prefix . 'partial_orders', ['id' => $partial_order->id]);
            }
            
            // Remove the meta key
            $order->delete_meta_data('_partial_order_key');
            $order->save();
        }
    }

    /**
     * Cleanup partial order when order is deleted
     *
     * @param int $post_id Post ID
     */
    public function cleanup_partial_order_on_delete($post_id) {
        if (get_post_type($post_id) === 'shop_order') {
            $this->cleanup_partial_order($post_id);
        }
    }

    /**
     * Add order columns to WooCommerce orders list
     *
     * @param array $columns Existing columns
     * @return array Modified columns
     */
    public function add_order_columns($columns) {
        $new_columns = [];
        foreach ($columns as $key => $column) {
            $new_columns[$key] = $column;
            if ($key === 'order_status') {
                $new_columns['partial_order_status'] = __('Partial Status', 'partial-orders-for-woocommerce');
            }
        }
        return $new_columns;
    }

    /**
     * Display content for custom order columns
     *
     * @param string $column Column name
     * @param int $post_id Post ID
     */
    public function order_column_content($column, $post_id) {
        if ($column === 'partial_order_status') {
            $order = wc_get_order($post_id);
            if ($order && $order->get_status() === 'partial') {
                echo '<mark class="order-status status-partial"><span>' . 
                    esc_html__('Partial', 'partial-orders-for-woocommerce') . 
                    '</span></mark>';
            }
        }
    }

    /**
     * Add admin order actions
     *
     * @param array $actions Existing actions
     * @param WC_Order $order Order object
     * @return array Modified actions
     */
    public function add_admin_order_actions($actions, $order) {
        if ($order->get_status() === 'partial') {
            $actions['view_partial'] = [
                'url' => $order->get_edit_order_url(),
                'name' => __('View Partial Order', 'partial-orders-for-woocommerce'),
                'action' => 'view partial-order'
            ];
        }
        return $actions;
    }

    public function add_admin_menu() {
        add_menu_page(
            __('Fraud Prevention System', 'partial-orders-for-woocommerce'),
            __('Fraud Prevention System', 'partial-orders-for-woocommerce'),
            'manage_woocommerce',
            'fraud-prevention-system',
            [$this, 'render_admin_page'],
            'dashicons-shield',
            56
        );
    }

    public function register_settings() {
        register_setting('fraud_prevention_settings', 'fps_enabled');
        register_setting('fraud_prevention_settings', 'fps_api_key');
        register_setting('fraud_prevention_settings', 'fps_api_secret');
        register_setting('fraud_prevention_settings', 'fps_minimum_score');
        register_setting('fraud_prevention_settings', 'fps_minimum_orders');
        register_setting('fraud_prevention_settings', 'fps_custom_cod_charge');
    }

    public function render_admin_page() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }

        if (isset($_POST['submit']) && check_admin_referer('fps_settings_save', 'fps_nonce')) {
            update_option('fps_enabled', isset($_POST['fps_enabled']) ? '1' : '0');
            update_option('fps_api_key', sanitize_text_field($_POST['fps_api_key']));
            update_option('fps_api_secret', sanitize_text_field($_POST['fps_api_secret']));
            update_option('fps_minimum_score', absint($_POST['fps_minimum_score']));
            update_option('fps_minimum_orders', absint($_POST['fps_minimum_orders']));
            update_option('fps_custom_cod_charge', sanitize_text_field($_POST['fps_custom_cod_charge']));

            echo '<div class="notice notice-success"><p>' . esc_html__('Settings saved successfully.', 'partial-orders-for-woocommerce') . '</p></div>';
        }

        $fps_enabled = get_option('fps_enabled', '0');
        $fps_api_key = get_option('fps_api_key', '');
        $fps_api_secret = get_option('fps_api_secret', '');
        $fps_minimum_score = get_option('fps_minimum_score', '70');
        $fps_minimum_orders = get_option('fps_minimum_orders', '1');
        $fps_custom_cod_charge = get_option('fps_custom_cod_charge', '');

        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('Fraud Prevention System', 'partial-orders-for-woocommerce'); ?></h1>

            <form method="post" action="">
                <?php wp_nonce_field('fps_settings_save', 'fps_nonce'); ?>

                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="fps_enabled"><?php echo esc_html__('Enable Fraud Prevention', 'partial-orders-for-woocommerce'); ?></label>
                        </th>
                        <td>
                            <input type="checkbox" id="fps_enabled" name="fps_enabled" value="1" <?php checked($fps_enabled, '1'); ?> />
                            <p class="description"><?php echo esc_html__('Enable fraud prevention checks at checkout', 'partial-orders-for-woocommerce'); ?></p>
                        </td>
                    </tr>
                </table>

                <div id="fps_settings_container" style="<?php echo $fps_enabled === '1' ? '' : 'display:none;'; ?>">
                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="fps_api_key"><?php echo esc_html__('API Key', 'partial-orders-for-woocommerce'); ?></label>
                            </th>
                            <td>
                                <input type="text" id="fps_api_key" name="fps_api_key" value="<?php echo esc_attr($fps_api_key); ?>" class="regular-text" />
                                <p class="description"><?php echo esc_html__('Your Nirvor API key', 'partial-orders-for-woocommerce'); ?></p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="fps_api_secret"><?php echo esc_html__('API Secret', 'partial-orders-for-woocommerce'); ?></label>
                            </th>
                            <td>
                                <input type="password" id="fps_api_secret" name="fps_api_secret" value="<?php echo esc_attr($fps_api_secret); ?>" class="regular-text" />
                                <p class="description"><?php echo esc_html__('Your Nirvor API secret', 'partial-orders-for-woocommerce'); ?></p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="fps_minimum_score"><?php echo esc_html__('Minimum Score (%)', 'partial-orders-for-woocommerce'); ?></label>
                            </th>
                            <td>
                                <input type="number" id="fps_minimum_score" name="fps_minimum_score" value="<?php echo esc_attr($fps_minimum_score); ?>" min="0" max="100" />
                                <p class="description"><?php echo esc_html__('Minimum percentage of successful deliveries required', 'partial-orders-for-woocommerce'); ?></p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="fps_minimum_orders"><?php echo esc_html__('Minimum Orders', 'partial-orders-for-woocommerce'); ?></label>
                            </th>
                            <td>
                                <input type="number" id="fps_minimum_orders" name="fps_minimum_orders" value="<?php echo esc_attr($fps_minimum_orders); ?>" min="1" />
                                <p class="description"><?php echo esc_html__('Minimum number of orders required', 'partial-orders-for-woocommerce'); ?></p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="fps_custom_cod_charge"><?php echo esc_html__('Custom COD Charge', 'partial-orders-for-woocommerce'); ?></label>
                            </th>
                            <td>
                                <input type="text" id="fps_custom_cod_charge" name="fps_custom_cod_charge" value="<?php echo esc_attr($fps_custom_cod_charge); ?>" class="small-text" />
                                <p class="description"><?php echo esc_html__('Fixed amount to charge in advance (leave empty to use shipping fees)', 'partial-orders-for-woocommerce'); ?></p>
                            </td>
                        </tr>
                    </table>
                </div>

                <?php submit_button(); ?>
            </form>
        </div>

        <script>
        jQuery(function($) {
            $('#fps_enabled').on('change', function() {
                if ($(this).is(':checked')) {
                    $('#fps_settings_container').slideDown();
                } else {
                    $('#fps_settings_container').slideUp();
                }
            });
        });
        </script>
        <?php
    }

    public function check_fraud_prevention() {
        check_ajax_referer('wc_fraud_check', 'nonce');

        $phone = isset($_POST['phone']) ? sanitize_text_field($_POST['phone']) : '';

        if (empty($phone)) {
            wp_send_json_error(['message' => 'Phone number is required']);
        }

        $fps_enabled = get_option('fps_enabled', '0');

        if ($fps_enabled !== '1') {
            wp_send_json_success([
                'passed' => true,
                'reason' => 'Fraud prevention is disabled'
            ]);
        }

        $api_key = get_option('fps_api_key', '');
        $api_secret = get_option('fps_api_secret', '');
        $minimum_score = (int) get_option('fps_minimum_score', 70);
        $minimum_orders = (int) get_option('fps_minimum_orders', 1);

        if (empty($api_key) || empty($api_secret)) {
            wp_send_json_success([
                'passed' => true,
                'reason' => 'API credentials not configured'
            ]);
        }

        $response = wp_remote_post('https://nirvor.app/api/v1/search', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-Key' => $api_key,
                'X-API-Secret' => $api_secret
            ],
            'body' => wp_json_encode(['phone' => $phone]),
            'timeout' => 10
        ]);

        if (is_wp_error($response)) {
            wp_send_json_success([
                'passed' => true,
                'reason' => 'API connection failed: ' . $response->get_error_message()
            ]);
        }

        $body = wp_remote_retrieve_body($response);
        $result = json_decode($body, true);

        if (!isset($result['success']) || !$result['success']) {
            $error_msg = isset($result['error']) ? $result['error'] : 'Unknown API error';
            wp_send_json_success([
                'passed' => true,
                'reason' => 'API returned error: ' . $error_msg
            ]);
        }

        $total_parcels = isset($result['overall']['total_parcels']) ? (int) $result['overall']['total_parcels'] : 0;
        $delivered = isset($result['overall']['delivered']) ? (int) $result['overall']['delivered'] : 0;
        $returned = isset($result['overall']['returned']) ? (int) $result['overall']['returned'] : 0;

        $score = $total_parcels > 0 ? ($delivered / $total_parcels) * 100 : 0;

        $passed = ($total_parcels >= $minimum_orders) && ($score >= $minimum_score);

        wp_send_json_success([
            'passed' => $passed,
            'total_parcels' => $total_parcels,
            'delivered' => $delivered,
            'returned' => $returned,
            'score' => round($score, 2),
            'minimum_score' => $minimum_score,
            'minimum_orders' => $minimum_orders,
            'phone' => $phone
        ]);
    }

    public function validate_checkout_fraud($data, $errors) {
        $fps_enabled = get_option('fps_enabled', '0');

        if ($fps_enabled !== '1') {
            return;
        }

        $chosen_payment_method = isset($_POST['payment_method']) ? sanitize_text_field($_POST['payment_method']) : '';

        if ($chosen_payment_method !== 'cod') {
            return;
        }

        $advance_payment_verified = WC()->session->get('fps_advance_payment_verified', false);

        if ($advance_payment_verified) {
            WC()->session->set('fps_advance_payment_verified', false);
            return;
        }

        $phone = isset($data['billing_phone']) ? sanitize_text_field($data['billing_phone']) : '';

        if (empty($phone)) {
            return;
        }

        $api_key = get_option('fps_api_key', '');
        $api_secret = get_option('fps_api_secret', '');
        $minimum_score = (int) get_option('fps_minimum_score', 70);
        $minimum_orders = (int) get_option('fps_minimum_orders', 1);

        if (empty($api_key) || empty($api_secret)) {
            return;
        }

        $response = wp_remote_post('https://nirvor.app/api/v1/search', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-Key' => $api_key,
                'X-API-Secret' => $api_secret
            ],
            'body' => wp_json_encode(['phone' => $phone]),
            'timeout' => 10
        ]);

        if (is_wp_error($response)) {
            return;
        }

        $body = wp_remote_retrieve_body($response);
        $result = json_decode($body, true);

        if (!isset($result['success']) || !$result['success']) {
            return;
        }

        $total_parcels = isset($result['overall']['total_parcels']) ? (int) $result['overall']['total_parcels'] : 0;
        $delivered = isset($result['overall']['delivered']) ? (int) $result['overall']['delivered'] : 0;

        $score = $total_parcels > 0 ? ($delivered / $total_parcels) * 100 : 0;

        $passed = ($total_parcels >= $minimum_orders) && ($score >= $minimum_score);

        if (!$passed) {
            $errors->add('fraud_prevention', __('Please pay delivery charges in advance to proceed with your order.', 'partial-orders-for-woocommerce'));
        }
    }

    public function check_advance_payment_completion($order_id) {
        $order = wc_get_order($order_id);

        if (!$order) {
            return;
        }

        if ($order->get_payment_method() === 'cod') {
            return;
        }

        if ($order->is_paid() || $order->has_status(['processing', 'completed'])) {
            WC()->session->set('fps_advance_payment_verified', true);
            WC()->session->set('fps_advance_payment_amount', $order->get_total());
            WC()->session->set('fps_advance_payment_order_id', $order_id);

            $order->update_meta_data('_fps_is_advance_payment', 'yes');
            $order->save();
        }
    }

    public function check_and_apply_advance_payment($order, $data) {
        $advance_payment_order_id = WC()->session->get('fps_advance_payment_order_id', 0);
        $advance_payment_amount = WC()->session->get('fps_advance_payment_amount', 0);

        if ($advance_payment_order_id && $advance_payment_amount > 0) {
            $fee = new WC_Order_Item_Fee();
            $fee->set_name(__('Advance Payment Credit', 'partial-orders-for-woocommerce'));
            $fee->set_amount(-$advance_payment_amount);
            $fee->set_total(-$advance_payment_amount);
            $order->add_item($fee);

            $order->update_meta_data('_fps_advance_payment_order_id', $advance_payment_order_id);
            $order->add_order_note(
                sprintf(
                    __('Advance payment of %s deducted from order total (Order #%d)', 'partial-orders-for-woocommerce'),
                    wc_price($advance_payment_amount),
                    $advance_payment_order_id
                )
            );

            WC()->session->set('fps_advance_payment_order_id', 0);
            WC()->session->set('fps_advance_payment_amount', 0);
            WC()->session->set('fps_advance_payment_verified', false);
        }
    }
}

WC_Partial_Orders::instance();