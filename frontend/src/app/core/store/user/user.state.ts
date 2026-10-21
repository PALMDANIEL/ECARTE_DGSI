import { User } from '../../models/user.model';
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
