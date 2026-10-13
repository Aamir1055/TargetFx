import { createContext, useContext } from 'react'

export const BrokerCreditContext = createContext({ credit: null, error: '', refresh: () => {}, updateCredit: () => {} })
export const useBrokerCredit = () => useContext(BrokerCreditContext)
