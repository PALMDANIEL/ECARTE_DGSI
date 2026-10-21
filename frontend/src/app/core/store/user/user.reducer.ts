import { createReducer, on } from '@ngrx/store';
import { User } from '../../models/user.model';
import * as UserActions from './user.actions';

export interface UserState {
  users: User[];
  selectedUser: User | null;
  loading: boolean;
  error: string | null;
}

export const initialUserState: UserState = {
  users: [],
  selectedUser: null,
  loading: false,
  error: null
};

export const userReducer = createReducer(
  initialUserState,
  on(UserActions.loadUsers, state => ({ ...state, loading: true })),
  on(UserActions.loadUsersSuccess, (state, { users }) => ({ ...state, users, loading: false })),
  on(UserActions.loadUsersFailure, (state, { error }) => ({ ...state, error, loading: false })),
  on(UserActions.createUserSuccess, (state, { user }) => ({ ...state, users: [...state.users, user] })),
  on(UserActions.updateUserSuccess, (state, { user }) => ({
    ...state,
    users: state.users.map(u => u.id === user.id ? user : u)
  })),
  on(UserActions.deleteUserSuccess, (state, { id }) => ({ ...state, users: state.users.filter(u => u.id !== id) })),
  on(UserActions.selectUser, (state, { id }) => ({ ...state, selectedUser: state.users.find(u => u.id === id) || null })),
  on(UserActions.clearSelectedUser, state => ({ ...state, selectedUser: null }))
);
