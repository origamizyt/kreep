use std::marker::PhantomData;
use std::path::Path;
use anyhow::Result;
use ciborium::{into_writer, from_reader};
use serde::Serialize;
use serde::de::DeserializeOwned;

pub trait Indexer<T> {
    type Index: AsRef<[u8]>;

    fn get_index(&self, value: &T) -> Self::Index;
}

pub struct Storage<T, F> 
    where 
        T: Serialize + DeserializeOwned,
        F: Indexer<T> 
{
    indexer: F,
    db: sled::Db,
    _marker: PhantomData<Vec<T>>
}

impl<T, F> Storage<T, F> 
    where
        T: Serialize + DeserializeOwned, 
        F: Indexer<T>
{
    pub fn open<P: AsRef<Path>>(path: P, indexer: F) -> Result<Self> {
        let db = sled::open(path)?;
        Ok(Self {
            indexer,
            db,
            _marker: PhantomData
        })
    }

    pub fn len(&self) -> usize {
        self.db.len()
    }

    pub fn set(&self, value: T) -> Result<()> {
        let index = self.indexer.get_index(&value);
        let mut bytes: Vec<u8> = vec![];
        into_writer(&value, &mut bytes)?;
        self.db.insert(
            index,
            bytes
        )?;
        Ok(())
    }

    pub fn get(&self, index: &F::Index) -> Result<Option<T>> {
        if let Some(bytes) = self.db.get(index)? {
            let value: T = from_reader(bytes.as_ref())?;
            Ok(Some(value))
        }
        else {
            Ok(None)
        }
    }

    pub fn remove(&self, index: &F::Index) -> Result<bool> {
        Ok(self.db.remove(index)?.is_some())
    }

    pub fn update(&self, index: &F::Index, mut updater: impl FnMut(T) -> T) -> Result<()> {
        let mut res: Result<()> = Ok(());
        self.db.update_and_fetch(index, |bytes| {
            let bytes = bytes?;
            match from_reader::<T, _>(bytes) {
                Ok(value) => {
                    let value = updater(value);
                    let mut bytes: Vec<u8> = vec![];
                    match into_writer(&value, &mut bytes) {
                        Ok(()) => Some(bytes),
                        Err(err) => {
                            res = Err(err.into());
                            None
                        }
                    }
                },
                Err(err) => {
                    res = Err(err.into());
                    None
                }
            }
        })?;
        res
    }

    pub fn iter(&self) -> Iter<T> {
        Iter(self.db.iter(), PhantomData)
    }
}

pub struct Iter<T: DeserializeOwned>(sled::Iter, PhantomData<Vec<T>>);

impl<T: DeserializeOwned> Iterator for Iter<T>{
    type Item = Result<T>;

    fn next(&mut self) -> Option<Self::Item> {
        let res = self.0.next()?;
        match res {
            Ok((_, bytes)) => {
                match from_reader::<T, _>(bytes.as_ref()) {
                    Ok(value) => Some(Ok(value)),
                    Err(err) => Some(Err(err.into()))
                }
            },
            Err(err) => Some(Err(err.into()))
        }
    }
}