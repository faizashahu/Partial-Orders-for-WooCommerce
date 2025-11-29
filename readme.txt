=== Partial Orders for WooCommerce ===
Contributors: mrbla4ck
Tags: woocommerce, orders, checkout, partial orders
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 7.2
Stable tag: 1.0.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Track and manage incomplete orders during WooCommerce checkout process.

== Description ==

Partial Orders for WooCommerce helps store owners track and manage incomplete orders during the checkout process. When customers start filling out the checkout form but don't complete their purchase, the plugin saves their progress as a partial order.

Features:

* Automatically saves checkout form data as customers type
* Creates partial orders that appear in WooCommerce orders list
* Adds a new "Partial" order status
* Cleans up partial orders when checkout is completed
* Supports guest checkout and logged-in users
* Handles cart updates during checkout

== Installation ==

1. Upload the plugin files to the `/wp-content/plugins/partial-orders-for-wc` directory, or install the plugin through the WordPress plugins screen directly.
2. Activate the plugin through the 'Plugins' screen in WordPress
3. WooCommerce must be installed and activated for this plugin to work

== Frequently Asked Questions ==

= How does it work? =

The plugin monitors the checkout form and automatically saves the customer's progress as they fill it out. This creates a partial order in WooCommerce that can be viewed in the orders list.

= Is it compatible with my theme? =

Yes, the plugin works with any WooCommerce compatible theme as it hooks into WooCommerce's standard checkout process.

= Does it work with custom checkout fields? =

Yes, the plugin will save any custom checkout fields that are properly integrated with WooCommerce.

== Changelog ==

= 1.0.2 =
* Fixed issue with multiple orders being created
* Improved database handling
* Added proper cleanup of partial orders
* Fixed translation issues

= 1.0.1 =
* Initial release

== Upgrade Notice ==

= 1.0.2 =
This version fixes a critical issue with multiple orders being created. Please update immediately.

== Screenshots ==

1. Partial orders in WooCommerce orders list
2. Partial order details
3. Checkout form auto-save in action

== Privacy Policy ==

This plugin saves customer checkout data in the WordPress database. This includes:

* Billing information
* Shipping information
* Cart contents
* Order notes

Data is automatically cleaned up when:
* An order is completed
* An order is manually deleted
* The plugin is deactivated

For more information, please see our privacy policy: https://example.com/privacy