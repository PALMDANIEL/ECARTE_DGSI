import { createReducer, on } from '@ngrx/store';
import { Company } from '../../models/company.model';
import * as CompanyActions from './company.actions';
export interface CompanyState {
  companies: Company[];
  loading: boolean;
  error: string | null;
}
export const initialCompanyState: CompanyState = {
  companies: [],
  loading: false,
  error: null
};
export const companyReducer = createReducer(
  initialCompanyState,
  on(CompanyActions.loadCompanies, state => ({ ...state, loading: true })),
  on(CompanyActions.loadCompaniesSuccess, (state, { companies }) => ({ ...state, companies, loading: false })),
  on(CompanyActions.loadCompaniesFailure, (state, { error }) => ({ ...state, error, loading: false })),
  on(CompanyActions.createCompanySuccess, (state, { company }) => ({ ...state, companies: [...state.companies, company] })),
  on(CompanyActions.updateCompanySuccess, (state, { company }) => ({
    ...state,
    companies: state.companies.map(c => c.id === company.id ? company : c)
  })),
  on(CompanyActions.deleteCompanySuccess, (state, { id }) => ({
    ...state,
    companies: state.companies.filter(c => c.id !== id)
  }))
);
