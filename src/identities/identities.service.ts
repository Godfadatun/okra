import { Injectable, NotFoundException } from '@nestjs/common';
import {
  confirmBVNDto,
  confirmNUBANDto,
  getAccountsFromBVNDto,
} from './dto/create-identity.dto';
import {
  UpdateIdentityDto,
  verifyCustomerDto,
} from './dto/update-identity.dto';
import axios from 'axios';
import { ENVIRONMENT, OKRA_URL } from 'src/config/env.config';
import { UtilsService } from 'src/utils/utils.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/users/entities/user.entity';
import { Identity, IdentityDocument } from './entities/identity.entity';
import * as randomstring from 'randomstring';
import {
  Customer,
  CustomerDocument,
} from 'src/customers/entities/customer.entity';

@Injectable()
export class IdentitiesService {
  constructor(
    private utils: UtilsService,
    @InjectModel(Identity.name) private identityModel: Model<IdentityDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  private axiosInstance = axios.create({
    baseURL: OKRA_URL,
    headers: {},
  });

  async getAccountsFromBVN(bvn: string) {
    try {
      if (ENVIRONMENT === 'TEST') {
        return {
          status: 'success',
          message: 'Account(s) successfully retrieved',
          data: {
            response: [
              {
                account_no: '0124781881',
                bank: 'slug bank',
              },
              {
                account_no: '2094452855',
                bank: 'not-slug bank',
              },
            ],
          },
        };
      }

      const { data } = await this.axiosInstance.post('accounts-by-bvn', {
        bvn,
      });
      return data;
    } catch (error) {
      console.log({ error: error.response.data });
      throw new NotFoundException(
        error.response.data.message,
        error.response.data.data,
      );
    }
  }

  async confirmNUBAN(payload: confirmNUBANDto) {
    try {
      if (ENVIRONMENT === 'TEST') {
        return {
          status: 'success',
          message: 'NUBAN successfully confimed',
          data: {
            response: {
              birthdate: '1991-11-06',
              account_number: '0124781881',
              bank: 'slug bank',
              full_name: 'John Doe',
              email: 'danyadegokey@gmail.com',
              phone_number: '2348135613401',
              bvn: '22338485291',
            },
          },
        };
      }
      const data = await this.axiosInstance.post('confirm-nuban', payload);
      return data;
    } catch (error) {
      console.log({ error: error.response.data });
      throw new NotFoundException(
        error.response.data.message,
        error.response.data.data,
      );
    }
  }

  async confirmBVN(payload: confirmBVNDto) {
    try {
      if (ENVIRONMENT === 'TEST') {
        return {
          status: 'success',
          message: 'BVN successfully confimed',
          data: {
            response: {
              FirstName: 'john',
              MiddleName: 'junior',
              LastName: 'doe',
              DateOfBirth: '1991-11-06',
              Address: '2a Iya Oloye',
              Gender: 'Male',
              PhotoId: 'http://127.0.0.1:3001/identities',
              Enrollment_Date: '2022-11-06',
              Enrollment_Bank: 'slug bank',
              Phone: '2348135613401',
              Email: 'danyadegokey@gmail.com',
              FullName: 'John Doe',
              Bvn: '22338485291',
              Nin: '88827657012',
              LGAOrigin: 'Chukun',
              LGAOfResidence: '8 Tudun-wada',
              nationality: 'Nigerian',
              State_of_residence: 'Lagos',
              State_of_origin: 'Kaduna',
              EnnrollmentBbank: 'slug Bank',
              RegistrationDate: '2022-11-06',
              Washlist: false,
              MaritalStatus: 'single',
              AccountLevel: 'level 1',
              VerificationCountry: 'NG',
            },
          },
        };
      }
      const data = await this.axiosInstance.post('confirm-bvn', payload);
      return data;
    } catch (error) {
      console.log({ error: error.response.data });
      throw new NotFoundException(
        error.response.data.message,
        error.response.data.data,
      );
    }
  }

  async checkIdentity(bvn: string) {
    try {
      const { data, status } = await this.getAccountsFromBVN(bvn);
      let nubanIdentities;
      let response;
      if (status === 'success') {
        const accounts = data.response;
        const { data: getNUBANDetails, status: getNUBANStatus } =
          await this.confirmNUBAN({
            nuban: accounts[0].account_no,
            bank: accounts[0].bank,
            bvn: String(bvn),
          });
        const { birthdate: dob } = getNUBANDetails.response;
        nubanIdentities = {
          dob,
          status: getNUBANStatus,
        };
      }
      if (nubanIdentities.status === 'success') {
        const { data: confirmBVNDetails } = await this.confirmBVN({
          dob: nubanIdentities.dob,
          bvn: String(bvn),
        });
        console.log({ confirmBVNDetails });
        response = confirmBVNDetails.response;
      }

      return response;
    } catch (error) {
      console.log({ error2: error.message });
      throw new NotFoundException(error.message, error.response);
    }
  }

  async verifyCustomerIdentity(id: string, payload: verifyCustomerDto) {
    try {
      const gottenIdentiy = await this.checkIdentity(payload.bvn);
      console.log({ gottenIdentiy });

      const identity = await this.identityModel
        .findOne({ bvn: payload.bvn })
        .exec();
      if (identity) throw new NotFoundException('This Identity already exists');

      const customer = await this.customerModel
        .findOne({ code: id })
        .select({
          otherName: 1,
          code: 1,
          identity: 1,
          phone_number: 1,
          email: 1,
          firstName: 1,
          lastName: 1,
        })
        .exec();
      if (!customer)
        throw new NotFoundException('This customer does not exists');

      if (customer.identity)
        return this.utils.sendObjectResponse(
          'Identity successfully processed',
          { createdIdentity: customer.identity },
        );

      const {
        Washlist: on_washlist,
        DateOfBirth: dob,
        FullName: fullname,
        Enrollment_Date: enrollment_date,
        Enrollment_Bank: enrollment_bank,
        LGAOrigin: lga_origin,
        LGAOfResidence: lga_residence,
        FirstName: first_name,
        MiddleName: middle_name,
        LastName: last_name,
        Phone,
        Email,
        ...rest
      } = gottenIdentiy;
      const newIdentiy = this.utils.toSnakeCase(rest);
      console.log({
        customer,
        rest,
        'this.utils.toSnakeCase(rest)': this.utils.toSnakeCase(rest),
      });

      const phones = [];
      const emails = [customer.email];
      const aliases = [];
      if (customer.phone_number) phones.push(customer.phone_number);
      if (Phone) phones.push(Phone);
      if (Email) emails.push(Email);

      if (customer.otherName !== middle_name) {
        const aliasExist = aliases.find((name) => name === customer.otherName);
        if (!aliasExist) aliases.push(customer.otherName);
      }
      if (customer.firstName !== first_name) {
        const aliasExist = aliases.find((name) => name === customer.firstName);
        if (!aliasExist) aliases.push(customer.firstName);
      }
      if (customer.lastName !== last_name) {
        const aliasExist = aliases.find((name) => name === customer.lastName);
        if (!aliasExist) aliases.push(customer.lastName);
      }

      const updatingPayload = {
        identity: `idt_${randomstring.generate({
          length: 6,
          capitalization: 'lowercase',
          charset: 'alphanumeric',
        })}`,
        ...newIdentiy,
        customer: customer._id,
        dob,
        fullname,
        enrollment_date,
        enrollment_bank,
        lga_origin,
        lga_residence,
        phones,
        emails,
        aliases,
        enrollment: {
          bank: gottenIdentiy.Enrollment_Bank,
          registration_date: gottenIdentiy.RegistrationDate,
        },
        on_washlist,
      };
      const createdIdentity = await this.customerModel
        .updateOne(
          {
            code: id,
            'identity.bvn': { $ne: gottenIdentiy.Bvn },
          },
          { $set: { identity: updatingPayload } },
        )
        .exec();
      console.log({ createdIdentity });

      const gottenIdentity = await this.customerModel
        .findOne({ code: id })
        .select({
          identity: 1,
          code: 1,
          _id: 0,
        })
        .exec();

      return this.utils.sendObjectResponse('Identity successfully processed', {
        createdIdentity: gottenIdentity
      });
    } catch (error) {
      console.log({ error });
      throw new NotFoundException(error.message, error.response);
    }
  }
}
