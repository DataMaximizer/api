import mongoose, { Document, Schema, Query } from "mongoose";
import argon2 from "argon2";

export enum UserType {
  OWNER = "owner",
  CUSTOMER = "customer",
  ADMIN = "admin",
  EMPLOYEE = "employee",
}

export enum UserSex {
  MALE = 1,
  FEMALE = 2,
}

export enum EmployeePosition {
  SERVICE_PROVIDER = "service-provider",
  ADMINISTRATION = "administration",
}

export interface IAddress {
  line1: string;
  line2?: string;
  line3?: string;
  postalCode: string;
  neighborhood: string;
  state: string;
  city: string;
  country: string;
}

export interface IConfiguration {
  position?: EmployeePosition[];
  shift?: {
    start: string;
    end: string;
  };
  lunch?: {
    start: string;
    end: string;
  };
  services?: Schema.Types.ObjectId[];
}

export interface IUser extends Document {
  type: UserType;
  name: string;
  email: string;
  phone?: string;
  document?: string;
  bornAt?: Date;
  address?: IAddress;
  sex?: UserSex;
  avatar?: string;
  configuration?: IConfiguration;
  companyName: string;
  companyUrl: string;
  password: string;
  deletedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  softDelete(): Promise<IUser>;
}

const addressSchema = new Schema<IAddress>({
  line1: { type: String },
  line2: { type: String },
  line3: { type: String },
  postalCode: { type: String },
  neighborhood: { type: String },
  state: { type: String, required: true },
  city: { type: String, required: true },
  country: { type: String, required: true },
});

const configurationSchema = new Schema<IConfiguration>({
  position: [
    {
      type: String,
      enum: Object.values(EmployeePosition),
    },
  ],
  shift: {
    start: String,
    end: String,
  },
  lunch: {
    start: String,
    end: String,
  },
  services: [
    {
      type: Schema.Types.ObjectId,
      ref: "Service",
    },
  ],
});

const userSchema = new Schema<IUser>(
  {
    type: {
      type: String,
      enum: Object.values(UserType),
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
    },
    document: {
      type: String,
      sparse: true,
      unique: true,
    },
    bornAt: {
      type: Date,
    },
    address: {
      type: addressSchema,
    },
    sex: {
      type: Number,
      enum: {
        values: Object.values(UserSex),
        message: "Sex must be either 1 (MALE) or 2 (FEMALE)",
      },
    },
    avatar: {
      type: String,
    },
    configuration: {
      type: configurationSchema,
      default: {},
    },
    companyName: {
      type: String,
      required: true,
    },
    companyUrl: {
      type: String,
      required: true,
    },
    password: {
      type: String,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        delete ret.password;
        return ret;
      },
    },
  }
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await argon2.hash(this.password);
  }
  next();
});

userSchema.pre(/^find/, function (this: Query<any, Document>) {
  this.find({ deletedAt: null });
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return argon2.verify(this.password, candidatePassword);
};

userSchema.methods.softDelete = async function (): Promise<IUser> {
  this.deletedAt = new Date();
  return this.save();
};

export interface CreateUserInput {
  type: UserType;
  name: string;
  email: string;
  phone: string;
  document: string;
  bornAt: Date;
  address: IAddress;
  sex: UserSex;
  avatar?: string;
  configuration?: Partial<IConfiguration>;
  password: string;
}

export interface UpdateUserInput
  extends Partial<Omit<CreateUserInput, "password">> {
  password?: string;
}

export const User = mongoose.model<IUser>("User", userSchema);
