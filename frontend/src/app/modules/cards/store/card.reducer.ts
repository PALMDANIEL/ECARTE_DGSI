import { createReducer, on, createAction, props } from '@ngrx/store';

export const loadCards = createAction('[Card List] Load');
export const loadCardsSuccess = createAction('[Card List] Success', props<{ cards: any[] }>());

export const cardReducer = createReducer(
  { items: [] as any[] },
  on(loadCardsSuccess, (state, { cards }) => ({ ...state, items: cards }))
);
