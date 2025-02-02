import React, { useContext } from 'react';
import PropTypes from 'prop-types';

import { Input, Modal, ModalBody, ModalFooter, ModalHeader, Button, Label } from 'reactstrap';

import CubeContext from 'contexts/CubeContext';
import CSRFForm from 'components/CSRFForm';

const UploadBulkReplaceModal = ({ isOpen, toggle }) => {
  const { cube } = useContext(CubeContext);
  return (
    <Modal isOpen={isOpen} toggle={toggle} labelledBy="uploadReplacementModalTitle">
      <ModalHeader id="uploadReplacementModalTitle" toggle={toggle}>
        Bulk Upload - Replace with CSV File Upload
      </ModalHeader>
      <CSRFForm method="POST" action={`/cube/bulkreplacefile/${cube.id}`} encType="multipart/form-data">
        <ModalBody>
          <p>
            Replaces all cards in your cube and Maybeboard. Acceptable files are .csv files with the exact format as our
            .csv export.
          </p>
          <Input type="file" id="uploadReplacementFile" name="document" />
          <Label for="uploadReplacementFile" className="visually-hidden">
            Choose file
          </Label>
        </ModalBody>
        <ModalFooter>
          <Button color="accent" type="submit">
            Upload
          </Button>
          <Button color="secondary" onClick={toggle}>
            Close
          </Button>
        </ModalFooter>
      </CSRFForm>
    </Modal>
  );
};

UploadBulkReplaceModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toggle: PropTypes.func.isRequired,
};

export default UploadBulkReplaceModal;
