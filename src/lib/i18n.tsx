import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'gu';

interface Translations {
  [key: string]: {
    en: string;
    gu: string;
  };
}

export const translations: Translations = {
  // Navigation & General
  'nav.newOrder': { en: 'New Order', gu: 'નવો ઓર્ડર' },
  'nav.queue': { en: 'Orders Queue', gu: 'ઓર્ડર કતાર' },
  'nav.dashboard': { en: 'Dashboard', gu: 'ડેશબોર્ડ' },
  'nav.menu': { en: 'Menu', gu: 'મેનુ' },
  'nav.signOut': { en: 'Sign Out', gu: 'સાઇન આઉટ' },
  'nav.installApp': { en: 'Install App', gu: 'ઍપ ઇન્સ્ટોલ કરો' },
  'nav.poweredBy': { en: 'Powered by Cohortix', gu: 'Cohortix દ્વારા સંચાલિત' },
  
  // App Shell Status
  'app.checkingSession': { en: 'Checking staff session...', gu: 'સ્ટાફ સત્ર ચકાસી રહ્યા છીએ...' },
  'app.accessDeniedTitle': { en: 'Access Denied', gu: 'પ્રવેશ નકારાયો' },
  'app.accessDeniedMsg': { en: 'Your account does not have an owner or waiter role assigned. Contact the restaurant admin.', gu: 'તમારા એકાઉન્ટમાં માલિક અથવા વેઇટર ભૂમિકા નથી. રેસ્ટોરન્ટ એડમિનનો સંપર્ક કરો.' },
  'app.loading': { en: 'Loading Cohortix POS...', gu: 'Cohortix POS લોડ થઈ રહ્યું છે...' },
  'app.alert.realtime': { en: 'Live updates delayed; queue is using fallback refresh.', gu: 'લાઇવ અપડેટ્સ વિલંબિત; કતાર ફોલબેક રિફ્રેશનો ઉપયોગ કરી રહી છે.' },
  'app.alert.permission': { en: 'Staff session required for live order actions.', gu: 'લાઇવ ઓર્ડર ક્રિયાઓ માટે સ્ટાફ સત્ર આવશ્યક છે.' },
  'app.alert.orderError': { en: 'Order not confirmed yet; retry only after this warning clears.', gu: 'ઓર્ડર હજુ કન્ફર્મ થયો નથી; આ ચેતવણી સાફ થયા પછી જ ફરી પ્રયાસ કરો.' },
  
  // Incoming Notification
  'notification.newOrder': { en: 'New Order Received', gu: 'નવો ઓર્ડર મળ્યો' },
  'notification.items': { en: 'items', gu: 'વસ્તુઓ' },
  
  // New Order Component
  'newOrder.searchMenu': { en: 'Search menu...', gu: 'મેનુ શોધો...' },
  'newOrder.all': { en: 'All', gu: 'બધા' },
  'newOrder.cartTitle': { en: 'Current Order', gu: 'વર્તમાન ઓર્ડર' },
  'newOrder.emptyCart': { en: 'No items in order', gu: 'ઓર્ડરમાં કોઈ વસ્તુઓ નથી' },
  'newOrder.subtotal': { en: 'Subtotal', gu: 'પેટા સરવાળો' },
  'newOrder.total': { en: 'Total', gu: 'કુલ' },
  'newOrder.placeOrder': { en: 'Place Order', gu: 'ઓર્ડર આપો' },
  'newOrder.saveChanges': { en: 'Save Changes', gu: 'ફેરફારો સાચવો' },
  'newOrder.cancelEdit': { en: 'Cancel Edit', gu: 'ફેરફાર રદ કરો' },
  'newOrder.clearCart': { en: 'Clear Cart', gu: 'કાર્ટ સાફ કરો' },
  'newOrder.specialInstructions': { en: 'Special instructions (optional)', gu: 'ખાસ સૂચનાઓ (વૈકલ્પિક)' },
  'newOrder.tableName': { en: 'Table / Customer Name', gu: 'ટેબલ / ગ્રાહકનું નામ' },
  'newOrder.orderTypeLine': { en: 'Order Type', gu: 'ઓર્ડર પ્રકાર' },
  'newOrder.dineIn': { en: 'Dine-in (Table)', gu: 'ડાઇન-ઇન (ટેબલ)' },
  'newOrder.takeaway': { en: 'Takeaway (Parcel)', gu: 'ટેકઅવે (પાર્સલ)' },

  // Order Queue Component
  'queue.title': { en: 'Orders Queue', gu: 'ઓર્ડર કતાર' },
  'queue.pending': { en: 'Pending', gu: 'બાકી' },
  'queue.preparing': { en: 'Preparing', gu: 'તૈયાર થઈ રહ્યું છે' },
  'queue.completed': { en: 'Completed', gu: 'પૂર્ણ' },
  'queue.cancelled': { en: 'Cancelled', gu: 'રદ કરેલ' },
  'queue.markPreparing': { en: 'Start Preparing', gu: 'તૈયારી શરૂ કરો' },
  'queue.markCompleted': { en: 'Mark Completed', gu: 'પૂર્ણ તરીકે ચિહ્નિત કરો' },
  'queue.markDelivered': { en: 'Mark Delivered', gu: 'વિતરિત તરીકે ચિહ્નિત કરો' },
  'queue.cancelOrder': { en: 'Cancel Order', gu: 'ઓર્ડર રદ કરો' },
  'queue.editOrder': { en: 'Edit Order', gu: 'ઓર્ડરમાં ફેરફાર કરો' },
  'queue.payment': { en: 'Payment', gu: 'ચુકવણી' },
  'queue.unpaid': { en: 'Unpaid', gu: 'ચૂકવેલ નથી' },
  'queue.paid': { en: 'Paid', gu: 'ચૂકવેલ' },
  'queue.cash': { en: 'Cash Received', gu: 'રોકડ મળી' },
  'queue.upi': { en: 'UPI Received', gu: 'UPI મળી' },
  'queue.confirmCancel': { en: 'Confirm Cancel', gu: 'રદ કરવાની ખાતરી કરો' },
  'queue.keepOrder': { en: 'Keep Order', gu: 'ઓર્ડર રાખો' },
  'queue.undoPending': { en: 'Undo (Move to Pending)', gu: 'પૂર્વવત કરો (બાકીમાં ખસેડો)' },
  'queue.modifyOrder': { en: 'Modify Order', gu: 'ઓર્ડરમાં ફેરફાર કરો' },
  'queue.adjustDueAmount': { en: 'Adjust Due Amount', gu: 'બાકી રકમ ગોઠવો' },
  'queue.clearPayment': { en: 'Clear / Adjust Payment', gu: 'ચુકવણી સાફ કરો / ગોઠવો' },
  'queue.clearWithAmount': { en: 'Clear With Amount', gu: 'રકમ સાથે સાફ કરો' },
  'queue.settlePayment': { en: 'Settle Payment', gu: 'ચુકવણી કરો' },
  'queue.retryAction': { en: 'Retry Last Action', gu: 'છેલ્લી ક્રિયા ફરી પ્રયાસ કરો' },
  'queue.live': { en: 'Live', gu: 'લાઇવ' },
  'queue.reconnecting': { en: 'Reconnecting', gu: 'ફરી કનેક્ટ થઈ રહ્યું છે' },
  'queue.orderAlerts': { en: 'Order Alerts', gu: 'ઓર્ડર ચેતવણીઓ' },
  'queue.push': { en: 'Push', gu: 'પુશ' },
  'queue.on': { en: 'On', gu: 'ચાલુ' },
  'queue.off': { en: 'Off', gu: 'બંધ' },
  'queue.noPendingOrders': { en: 'No pending orders. Time to relax!', gu: 'કોઈ બાકી ઓર્ડર નથી. આરામ કરવાનો સમય છે!' },
  'queue.noPaymentPendingOrders': { en: 'No unpaid completed orders.', gu: 'કોઈ અવેતન પૂર્ણ ઓર્ડર નથી.' },
  'queue.noCompletedOrders': { en: 'No completed orders yet.', gu: 'હજુ સુધી કોઈ પૂર્ણ ઓર્ડર નથી.' },
  
  // Dashboard & Misc
  'dashboard.title': { en: 'POS Analytics', gu: 'POS એનાલિટિક્સ' },
  'dashboard.day': { en: 'Day', gu: 'દિવસ' },
  'dashboard.week': { en: 'Week', gu: 'અઠવાડિયું' },
  'dashboard.month': { en: 'Month', gu: 'મહિનો' },
  'dashboard.specificDate': { en: 'Specific Date', gu: 'ચોક્કસ તારીખ' },
  'dashboard.specificMonth': { en: 'Specific Month', gu: 'ચોક્કસ મહિનો' },
  'dashboard.customRange': { en: 'Custom Date Range', gu: 'કસ્ટમ તારીખ શ્રેણી' },
  'dashboard.applyDate': { en: 'Apply Date', gu: 'તારીખ લાગુ કરો' },
  'dashboard.applyMonth': { en: 'Apply Month', gu: 'મહિનો લાગુ કરો' },
  'dashboard.applyRange': { en: 'Apply Range', gu: 'શ્રેણી લાગુ કરો' },
  'dashboard.refreshing': { en: 'Refreshing analytics', gu: 'એનાલિટિક્સ રિફ્રેશ કરી રહ્યું છે' },
  'dashboard.collected': { en: 'Collected', gu: 'એકત્ર કરેલ' },
  'dashboard.expenses': { en: 'Expenses', gu: 'ખર્ચ' },
  'dashboard.netProfit': { en: 'Net Profit', gu: 'ચોખ્ખો નફો' },
  'dashboard.orders': { en: 'Orders', gu: 'ઓર્ડર' },
  'dashboard.avgOrderValue': { en: 'Avg Order Value', gu: 'સરેરાશ ઓર્ડર મૂલ્ય' },
  'dashboard.paymentBreakdown': { en: 'Payment Breakdown', gu: 'ચુકવણી વિરામ' },
  'dashboard.orderFlow': { en: 'Order Flow', gu: 'ઓર્ડર ફ્લો' },
  'dashboard.collectionHealth': { en: 'Collection Health', gu: 'સંગ્રહ આરોગ્ય' },
  'dashboard.productSales': { en: 'Product Sales Highlights', gu: 'ઉત્પાદન વેચાણ હાઇલાઇટ્સ' },
  'dashboard.productOrderCount': { en: 'Product Order Count', gu: 'ઉત્પાદન ઓર્ડર ગણતરી' },
  'dashboard.addExpense': { en: 'Add Expense', gu: 'ખર્ચ ઉમેરો' },
  'dashboard.expensesList': { en: 'Expenses List', gu: 'ખર્ચની સૂચિ' },
  'dashboard.ordersList': { en: 'Orders List (Detailed)', gu: 'ઓર્ડરની સૂચિ (વિગતવાર)' },

  'common.search': { en: 'Search', gu: 'શોધો' },
  'common.save': { en: 'Save', gu: 'સાચવો' },
  'common.cancel': { en: 'Cancel', gu: 'રદ કરો' },
  'common.delete': { en: 'Delete', gu: 'કાઢી નાખો' },
  'common.edit': { en: 'Edit', gu: 'ફેરફાર કરો' },
  'common.add': { en: 'Add', gu: 'ઉમેરો' },

  // Menu Categories
  'Main Course': { en: 'Main Course', gu: 'મુખ્ય ભોજન' },
  'Starters': { en: 'Starters', gu: 'સ્ટાર્ટર્સ' },
  'Beverages': { en: 'Beverages', gu: 'પીણાં' },
  'Desserts': { en: 'Desserts', gu: 'મીઠાઈઓ' },
  'Breads': { en: 'Breads', gu: 'રોટી / બ્રેડ' },
  'Rice & Biryani': { en: 'Rice & Biryani', gu: 'ચોખા અને બિરયાની' },
  'Fast Food': { en: 'Fast Food', gu: 'ફાસ્ટ ફૂડ' },
  'South Indian': { en: 'South Indian', gu: 'સાઉથ ઇન્ડિયન' },
  'Thali': { en: 'Thali', gu: 'થાળી' },

  // Common Menu Items & Variants
  'Masala Dosa': { en: 'Masala Dosa', gu: 'મસાલા ઢોસા' },
  'Idli Sambhar': { en: 'Idli Sambhar', gu: 'ઇડલી સાંભાર' },
  'Paneer Butter Masala': { en: 'Paneer Butter Masala', gu: 'પનીર બટર મસાલા' },
  'Dal Makhani': { en: 'Dal Makhani', gu: 'દાળ મખની' },
  'Roti': { en: 'Roti', gu: 'રોટી' },
  'Naan': { en: 'Naan', gu: 'નાન' },
  'Jeera Rice': { en: 'Jeera Rice', gu: 'જીરા રાઇસ' },
  'Veg Biryani': { en: 'Veg Biryani', gu: 'વેજ બિરયાની' },
  'Samosa': { en: 'Samosa', gu: 'સમોસા' },
  'Gulab Jamun': { en: 'Gulab Jamun', gu: 'ગુલાબ જાંબુ' },
  
  // Options / Variants
  'Half': { en: 'Half', gu: 'અડધું' },
  'Full': { en: 'Full', gu: 'આખું' },
  'Regular': { en: 'Regular', gu: 'નિયમિત' },
  'Large': { en: 'Large', gu: 'મોટું' }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string) => key,
});

const LANGUAGE_STORAGE_KEY = 'mdpos_language_preference';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language;
    if (saved && (saved === 'en' || saved === 'gu')) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  };

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
