use anyhow::Result;
use aes_gcm_siv::{
    aead::{Aead, Payload}, 
    Aes256GcmSiv, KeyInit
};
use rand_core::{OsRng, TryRngCore};
use serde::{Serialize, Deserialize};
use serde_json::to_vec;
use uuid::Uuid;

use crate::storage::Indexer;

#[derive(Serialize, Deserialize)]
pub struct Credential {
    pub id: Uuid,
    pub user: String,
    pub password: String,
    #[serde(with = "serde_bytes")]
    pub api_key: [u8; 32]
}

pub struct CredentialIndexer;

impl Indexer<Credential> for CredentialIndexer {
    type Index = Uuid;

    fn get_index(&self, value: &Credential) -> Self::Index {
        value.id.clone()
    }
}

pub struct Capsule {
    pub nonce: [u8; 12],
    pub token: Vec<u8>
}

impl Capsule { 
    pub fn to_bytes(&self) -> Vec<u8> {
        [self.nonce.as_slice(), &self.token].concat()
    }
    pub fn to_hex(&self) -> String {
        hex::encode(self.to_bytes())
    }
}

impl ToString for Capsule {
    fn to_string(&self) -> String {
        self.to_hex()
    }
}

impl Credential {
    pub fn new(user: &str, password: &str) -> Self {
        let mut api_key = [0u8; 32];
        OsRng.try_fill_bytes(&mut api_key)
            .expect("Failed to generate random values.");
        Self {
            id: Uuid::new_v4(),
            user: user.to_string(),
            password: password.to_string(),
            api_key
        }
    }

    pub fn capsule(&self) -> Result<Capsule> {
        let data = to_vec(&(&self.user, &self.password))?;
        let aead = Aes256GcmSiv::new(&self.api_key.into());
        let mut nonce = [0u8; 12];
        OsRng.try_fill_bytes(&mut nonce)
        .expect("Failed to generate nonce value.");
        let ciphertext = aead.encrypt(&nonce.into(), Payload{
            msg: &data,
            aad: self.id.as_bytes(),
        })?;
        Ok(Capsule{ nonce, token: ciphertext })
    }
}